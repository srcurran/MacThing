#!/bin/sh
# Car Thing sleep watchdog — runs on the device itself, under supervisord.
#
# While the bridge is connected it owns the backlight: it writes the heartbeat file every few
# seconds with the state it wants the screen in. When the Mac goes away — shut down, asleep with
# the port still powered, cable pulled, bridge stopped — that heartbeat stops, and nothing else
# on the device would ever turn the backlight off: the "Waiting for your Mac" screen would stay
# lit for as long as the Car Thing has power. This notices, and puts the panel to sleep until
# someone presses a button or turns the knob.
#
# Installed at /var/lib/carthing/sleepd.sh by scripts/setup-device.sh; the bridge pushes updates
# to it, and to /var/lib/carthing/sleep.conf, whenever it connects.

set -u

CONF=/var/lib/carthing/sleep.conf
BL=/sys/class/backlight/aml-bl/bl_power
GOV=/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
MARK=/tmp/carthing-input

# Defaults. sleep.conf, generated from bridge/config.js, overrides them.
HB=/tmp/carthing-heartbeat  # what the Mac writes: "<counter> <on|off>"
IDLE=90                     # seconds without a heartbeat before the screen sleeps
WAKE=20                     # seconds awake after a button or knob press while the Mac is away
POLL=1                      # seconds between checks (also the wake-on-input latency)
POWERSAVE=1                 # also drop the CPU governor to powersave while asleep

[ -f "$CONF" ] && . "$CONF"

say() { echo "[sleepd] $*"; }

HAVE_TIMEOUT=no
command -v timeout >/dev/null 2>&1 && HAVE_TIMEOUT=yes
# supervisorctl talks to supervisord over a socket; never block the loop on it.
sctl() {
  if [ "$HAVE_TIMEOUT" = yes ]; then timeout 5 supervisorctl "$@" >/dev/null 2>&1
  else supervisorctl "$@" >/dev/null 2>&1; fi
}

GOV_WAS=""
[ -r "$GOV" ] && read -r GOV_WAS < "$GOV" 2>/dev/null

# Same sequence the bridge uses: the ambient-light daemon is paused while the screen is off so
# it can't relight it behind our back.
backlight() {
  if [ "$1" = on ]; then
    echo 0 > "$BL" 2>/dev/null
    sctl start backlight
  else
    sctl stop backlight
    echo 4 > "$BL" 2>/dev/null
  fi
  say "backlight $1"
  return 0
}

# Idle down the CPU too while we're the ones holding the screen off. Only ever changed around
# our own sleep, and always put back before the bridge takes the screen over again.
governor() {
  [ "$POWERSAVE" = 1 ] || return 0
  [ -n "$GOV_WAS" ] && [ -w "$GOV" ] || return 0
  if [ "$1" = powersave ]; then echo powersave > "$GOV" 2>/dev/null
  else echo "$GOV_WAS" > "$GOV" 2>/dev/null; fi
  return 0
}

# Buttons and the knob are evdev devices. Reading one doesn't take the events away from
# Chromium — every open file description gets its own copy — so the UI still sees them.
WATCHERS=""
start_watchers() {
  : > "$MARK"
  for dev in /dev/input/event*; do
    [ -r "$dev" ] || continue
    cat "$dev" >> "$MARK" 2>/dev/null &
    WATCHERS="$WATCHERS $!"
  done
  [ -n "$WATCHERS" ] || say "no readable /dev/input/event* — nothing can wake the screen"
}
stop_watchers() {
  for pid in $WATCHERS; do kill "$pid" 2>/dev/null; done
  WATCHERS=""
}
watchers_alive() {
  [ -n "$WATCHERS" ] || return 1
  for pid in $WATCHERS; do kill -0 "$pid" 2>/dev/null || return 1; done
  return 0
}
# True when something was pressed or turned since the last check; always drains the marker.
input_seen() {
  [ -s "$MARK" ] || return 1
  : > "$MARK"
  return 0
}

cleanup() {
  stop_watchers
  governor restore
  backlight on  # never leave the device dark with no one left to wake it
  exit 0
}
trap cleanup INT TERM

start_watchers
say "started (idle ${IDLE}s, wake ${WAKE}s, heartbeat $HB)"

beat=""     # last heartbeat seen, to spot it standing still
idle=0      # seconds since it last changed
want=on     # screen state the bridge asked for, restored when it comes back
mode=host   # host = the Mac drives the screen; sleep / wake = we do
left=0      # seconds of wake time remaining
ticks=0

while :; do
  hb=""
  [ -f "$HB" ] && read -r hb < "$HB" 2>/dev/null
  if [ -n "$hb" ] && [ "$hb" != "$beat" ]; then
    beat="$hb"
    idle=0
    case "$hb" in *" off") want=off ;; *) want=on ;; esac
  else
    idle=$((idle + POLL))
  fi

  input=no
  input_seen && input=yes

  if [ "$idle" -lt "$IDLE" ]; then
    if [ "$mode" != host ]; then
      mode=host
      governor restore
      backlight "$want"  # the Mac is back: hand the screen over in the state it wants
    fi
  else
    case "$mode" in
      host)
        mode=sleep
        say "no heartbeat for ${IDLE}s — sleeping"
        backlight off
        governor powersave
        ;;
      sleep)
        if [ "$input" = yes ]; then mode=wake; left=$WAKE; governor restore; backlight on; fi
        ;;
      wake)
        if [ "$input" = yes ]; then
          left=$WAKE
        else
          left=$((left - POLL))
          if [ "$left" -le 0 ]; then mode=sleep; backlight off; governor powersave; fi
        fi
        ;;
    esac
  fi

  ticks=$((ticks + 1))
  if [ $((ticks % 30)) -eq 0 ] && ! watchers_alive; then
    say "input watchers stopped; restarting them"
    stop_watchers
    start_watchers
  fi

  sleep "$POLL"
done
