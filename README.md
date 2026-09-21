# Car Thing → Mac Now Playing

Turns a Spotify Car Thing into a desk display and volume knob for macOS.
It has four screens: Now Playing, Weather, Clock and Calendar.

| Control | Action |
|---|---|
| Top buttons 1 · 2 · 3 · 4 | Now Playing · Weather · Clock · Calendar |
| Turn knob | Mac output volume (in Settings: move the selection) |
| Press knob once / twice / three times | Play-pause / next track / previous track; starts Apple Music if nothing is playing (in Settings: change the selected option) |
| Fifth top button (settings) | Settings (press it again, or the back button, to close) |
| Hold the fifth top button | Sleep now — screen off until the next button or knob input |
| Back button (under the knob) | Favorite / unfavorite the playing Apple Music song |

The four screens:

- **Now Playing** follows whatever is playing in Control Center's Now Playing: Apple Music, Spotify, Podcasts, YouTube in a browser, and so on. It shows the artist, title, album, progress and artwork, plus a paused state, an app badge for non-Music sources, and the analog clock face when nothing is playing. Optionally the artwork also fills the screen behind everything, blurred and tinted.
- **Weather** shows the current conditions, the next few hours and five days. It uses [Open-Meteo](https://open-meteo.com) (free, no account) for your Mac's location or a place you pick.
- **Clock** shows an analog face (plain or with numbers) or a digital one — pick which on the Mac settings page — plus the next event still to come today, or "No events today".
- **Calendar** shows today's remaining events and, by default, tomorrow's under their own heading. Choose how many days (1–7) and which calendars on the Mac settings page.

**Sleep:** the Car Thing's screen turns off whenever your Mac's display sleeps, when you hold the settings button, and — this part runs on the device itself — about a minute and a half after the Mac stops talking to it at all: shut down, unplugged from the Mac but still powered, or just the bridge stopped. Press any button or turn the knob to wake it; while the Mac is away it stays lit for 20 seconds, and while the Mac is only asleep, for a minute. That first input only wakes it.

**Lock:** while your Mac is locked — the lock screen, or switched to another account — the screen stays off and no button wakes it. It comes back when you log in.

The backlight is the part that wears out, so "off" means the backlight really is off, not a black page — plus the device idles its CPU and the UI stops redrawing. There's no suspend-to-RAM: the Car Thing's kernel can't resume from one, and USB would drop with it, so an idle backlit-off device drawing very little is as deep as this goes.

**Lock:** while your Mac is locked — the lock screen, or switched to another account — the backlight stays off and no button wakes it. It comes back when you log in.

**Settings** covers appearance (dark, light or match the Mac), °F/°C, 12/24-hour time, the album art background and the weather location. Anything that needs typing or a longer list — a city, and which calendars and how many days the Calendar screen shows — opens a settings page on your Mac at http://127.0.0.1:4747.

### Before you grant anything

Nothing is required for the device to work: Now Playing and the clock need no permissions at all. The other screens say what they need, in place:

| Screen | Without permission | How it's fixed |
|---|---|---|
| Now Playing | works; shows the clock face when nothing is playing | — |
| Clock | works; the event line stays blank until Calendar is allowed | — |
| Weather | "Location access is off" with the place-picker hint | allow Location, or pick a city on the Mac page |
| Calendar | "Calendar access is off", naming the System Settings pane | allow Calendars for Car Thing Helper |
| Back button (favorite) | toast: "Allow musicctl to control Music" | allow Automation for musicctl |
| Knob on an output with no software volume | "No volume control on <device>" | use an output that has one |
| Bridge not running | "Waiting for your Mac" | start it, or `npm run install-agent` |

## What you need

- **A Mac** running macOS 15.4 or later (developed on macOS 27), with the Xcode command-line tools (`xcode-select --install`).
- **Node 22 or later.**
- **adb:** `brew install android-platform-tools`.
- **A Car Thing with ADB access**, meaning community-modified firmware such as the Thing Labs / DeskThing image based on Spotify's 8.9.2. Plug it in by USB and check that `adb devices -l` lists `product:spotify-car-thing`.

## Setup (once)

```bash
git clone https://github.com/srcurran/carthing-now-playing.git
cd carthing-now-playing
npm run build          # compiles the Swift helpers and the MediaRemote adapter, then self-tests it
npm run setup-device   # makes the Car Thing boot into this UI (reversible; see "Undo")
npm run install-agent  # starts the bridge now and at every login
```

That's it. The Car Thing switches to the Now Playing screen within a few seconds.

Re-run `npm run setup-device` if the bridge logs `boot web app not pointed at our UI yet` or `no sleep watchdog`. The rootfs edit normally survives a reboot, but it has been seen to revert, and a device that's been reflashed or restored will need it again. Nothing breaks meanwhile — the bridge points the device at this UI on every connect — but until you do, the Car Thing shows Spotify's own app before the bridge connects, and doesn't sleep on its own when the Mac goes away.

The first time you favorite a song with the back button, macOS asks whether **musicctl** may control Music. That's `native/bin/musicctl`, a small helper that sends the favorite and play commands to Apple Music.

The first time the Weather and Calendar screens load, macOS asks whether **Car Thing Helper** may use your location and your calendars. That's `native/bin/CarThingHelper.app`, a small helper so these permissions don't go to Node or Terminal. If you decline location, pick a place in Settings instead. You can change either answer later in System Settings → Privacy & Security.

## Launching

The Car Thing is only a display. The work happens in the **bridge**, a small Node program on your Mac (`bridge/main.js`). It reads Now Playing and the volume, and drives the Car Thing over USB. The Car Thing shows "Waiting for your Mac" whenever the bridge isn't running.

### Automatically at login (recommended)

`npm run install-agent` installs a per-user LaunchAgent at `~/Library/LaunchAgents/com.carthing.bridge.plist`. macOS then starts the bridge when you log in and restarts it if it ever exits. There's nothing to open or keep running yourself. Unplugging, replugging or rebooting the Car Thing is handled automatically.

```bash
npm run status          # is it running?
npm run logs            # follow the log (~/Library/Logs/carthing-bridge.log)
npm run restart         # restart it, e.g. after pulling updates
npm run uninstall-agent # stop it and remove it from login
```

The agent records the absolute path of the `node` you installed it with. If you later remove that Node version (for example with nvm), run `npm run install-agent` again.

### Manually

```bash
npm start       # runs in the foreground; Ctrl-C to stop
npm run dev     # same, plus: redeploys ui/ to the device on every save and logs raw knob/button events
```

Don't run a manual copy while the agent is running, because both would fight over the device. Run `npm run uninstall-agent` first, and `npm run install-agent` when you're done.

### After pulling updates

```bash
npm run build         # only needed if native/ changed
npm run restart       # the bridge pushes any UI changes to the Car Thing by itself
npm run setup-device  # only if you set the device up before the sleep watchdog existed
```

## Customizing

**Everyday settings.** Use the device's Settings screen (fifth top button) or http://127.0.0.1:4747 on the Mac. They're saved in `~/Library/Application Support/carthing-now-playing/settings.json`.

**Hardware mapping and behavior.** Edit `bridge/config.js`, then `npm run restart`:

- `buttons`: what each button does (`screen:<name>`, `settings`, or a media command)
- `knobClicks` and `multiClickMs`: the single, double and triple press actions, and how long a single press waits for more
- `volumeStep`: volume change per knob click
- `knobDirection`: `1` matches Spotify's own mapping (turning right raises the volume); `-1` flips it
- `sleepWithMac` and `screenWakeMs`: follow the Mac's display and lock screen, and how long a button or knob wake lasts while the Mac's display is off
- `buttonHolds` and `holdMs`: what a held button does (`sleep` by default on the settings button) and how long the hold is. A button with a hold acts on release, so one press isn't both things
- `deviceSleepSeconds`, `deviceWakeSeconds`, `devicePowersave`: the device's own sleep once the Mac goes quiet — how long it waits, how long an input wakes it for, and whether it also idles the CPU. Changes reach the device the next time the bridge connects (`npm run restart`)
- `macVolumeIndicator`: see below

**macOS volume pop-up.** By default the knob sets the volume directly. The Sound menu reflects the change, but macOS doesn't show its volume pop-up. To get the pop-up, set `macVolumeIndicator: true`, restart, and allow `native/bin/volumectl` under **System Settings → Privacy & Security → Accessibility**. The knob then presses the Mac's volume keys. macOS requires that permission for any software that generates keystrokes. A physical keyboard doesn't need it because its keys come from hardware.

## Undo

```bash
npm run uninstall-agent   # remove the login item
npm run restore-device    # put Spotify's original web app and config back, then reboot the Car Thing
```

## Design

Every screen is drawn in the Figma file [spotify-now-playing-2026](https://www.figma.com/design/Xw7pn5j4QZ8Ns237keo3ev/spotify-now-playing-2026?node-id=0-1) — Now Playing and its states, the three widgets, Settings, and light copies of them all. The type scale is by size, so the same numbers turn up everywhere:

- 112 / 120 semibold, Merriweather: the big number (weather temperature, clock date, calendar time)
- 40 / 56 semibold, Merriweather: the song title
- 32 / 40 semibold: second line of a panel, weather conditions
- 22 / 28: everything else, in bold, semibold, medium, regular or light by role — nothing is smaller
- panel and square insets: 48 top and bottom, 24 left, 64 right so the knob's dial doesn't cover anything

Inter is bundled in weights 300–700, plus variable Merriweather for the song title and the big numbers.

## How it works

```
Mac                                                         Car Thing (USB)
────────────────────────────────────────────                ─────────────────────────────────
bridge/main.js (Node, no npm deps)
 ├─ Now Playing ← /usr/bin/perl + MediaRemoteAdapter        Chromium 69 kiosk
 │               (streams JSON; also sends play/next/…)       file:///…/webapp/index.html
 ├─ Volume     ⇄ native/bin/volumectl (CoreAudio)             → symlink → /var/lib/carthing/ui
 ├─ App badges ← native/bin/appinfo (name + icon)             ui/js/core.js + one file per screen
 ├─ Location, calendar ← native/bin/CarThingHelper.app
 ├─ Sleep/lock  ← native/bin/powerwatch (IOKit + CGSession; holds sleep ≤3 s to kill the backlight)
 ├─ Heartbeat  ── adb shell → /tmp/carthing-heartbeat ───▶     sleepd.sh (backlight off when it stops)
 ├─ Weather    ← Open-Meteo (HTTPS)
 ├─ Settings page http://127.0.0.1:4747
 └─ Device link ── adb forward tcp:22222 → tcp:2222 ──────▶     (Chromium devtools port)
      Mac → page: Runtime.evaluate(__carthingReceive(msg))
      page → Mac: __carthingSend(json) (Runtime.addBinding)
      UI sync: adb push ui/ → /var/lib/carthing/ui when its hash changes
```

The page on the device never touches the network. The Mac drives it over the Chrome DevTools Protocol.
Buttons and the knob reach the page as ordinary `keydown` (`1`–`4`, `Enter`, `Escape`, `m`) and `wheel` (`deltaX` ±53 per click) events, and the page forwards actions to the Mac.
`npm run screenshot out.png` captures what the device is showing.

## The device

The device this was built on runs Spotify's final firmware, `v8.9.2`, community-modified:

- root `adbd` plus an RNDIS gadget (`/etc/init.d/S49usbgadget`)
- Chromium 69 kiosk run by supervisord with `--remote-debugging-port=2222`
- Weston compositor
- 32-bit userland on a 64-bit kernel, 512 MB RAM

`npm run setup-device` changes three things, and `npm run restore-device` reverts all of them:

- `/usr/share/qt-superbird-app/webapp` becomes a symlink to `/var/lib/carthing/ui`. Spotify's original is kept as `webapp.spotify`.
- Spotify's background app (`qt-superbird-app`) no longer autostarts. It was using about 15% CPU on wake-word listening and Bluetooth pairing. The original config is kept as `/etc/supervisord.conf.spotify`.
- `device/sleepd.sh` is installed at `/var/lib/carthing/sleepd.sh` and registered with supervisord as `carthing-sleep`, so the device can sleep without the Mac (below). The bridge keeps the script and its `sleep.conf` up to date on every connect; `supervisorctl status carthing-sleep` and `/tmp/carthing-sleep.log` on the device show what it's doing.

### Sleeping without the Mac

Nothing on the Mac can turn the backlight off once the Mac is gone, so the device watches for the Mac instead:

- while the bridge is connected it writes `/tmp/carthing-heartbeat` every 10 seconds — a counter plus the screen state it wants. The bridge still owns the backlight; `sleepd.sh` only reads along.
- when that file stops changing for `deviceSleepSeconds`, the Mac isn't there any more: `sleepd.sh` stops the ambient-light daemon, writes `0` to `/sys/class/aml_bl/power` and idles the CPU. This kernel's governors are `interactive performance schedutil` — there's no `powersave` — so it uses `schedutil` where it exists and otherwise caps the clock to its lowest step.
- it wakes on any input by reading `/dev/input/event*` in the background. evdev hands every reader its own copy of each event, so Chromium still sees the same press.
- when the heartbeat starts changing again it puts the governor back and hands the screen over in whatever state the heartbeat last asked for.

The page does its own small version of this: after the same timeout with no messages it renders black, so the screen isn't showing "Waiting for your Mac" all night even on a device where the watchdog isn't installed.

### Gotchas

- **Never run `adb reverse`.** It crashes this adbd, the USB gadget unbinds, and the device disappears from USB until it's power-cycled. That's why everything goes Mac → device.
- **adb's server loses the device when the Mac sleeps.** This is the common one, and it isn't the Car Thing's fault: after a sleep the device is still on the USB bus — `ioreg -p IOUSB | grep Superbird` finds it — while `adb devices` stays empty and no `track-devices` event ever arrives. `adb kill-server` brings it straight back. The bridge does that itself once the device has been missing for `adbRestartMs`, and polls every 30s because a stale server sends no events to react to. Straight after the Mac wakes — when this nearly always happens — it only waits 8s, since a device missing at that moment is far more likely to be a stale list than a real absence.
- **Behind a USB hub, the device can also lose the bus outright.** On a monitor hub the Car Thing saw `not attached` and needed the gadget rebinding; on a port directly on the Mac, across the same sleep, it stayed `configured` and needed nothing. `/etc/init.d/S49usbgadget` only builds the gadget at boot, so when it does wedge, replugging the cable isn't enough while the device still has power — it has to lose power completely. `sleepd.sh` rebinds the UDC itself after `deviceUsbHealSeconds` of silence, immediately on a button press, and immediately when the controller's state changes while the Mac is quiet — that last one is the host coming back. All three only act while no host has the gadget configured, so they can't interrupt a working link.
- macOS has no RNDIS driver, so the device's USB network interface is unused.
- The kernel has no USB HID gadget driver, so the Car Thing can't simply act as a USB media-key device.
- The device clock is never set, so the idle clock uses the Mac's time and timezone.
- The backlight switch is `/sys/class/aml_bl/power` (`echo 0|1`). The standard `/sys/class/backlight/aml-bl/bl_power` and its `brightness` accept writes and do nothing: the LEDs stay lit while the page goes black.
- `npm run setup-device` doesn't survive a power cycle (see Setup).
- Userland is 32-bit, so a raw `input_event` is 16 bytes, not 24. This matters only if you read or inject `/dev/input/event*` yourself.
- The UI must be plain ES2017 and CSS that Chromium 69 supports: no `?.`, `??`, flex `gap`, `inset`, `aspect-ratio` or `clamp()`.

## Known limitations

- **Now Playing relies on a workaround.** Since macOS 15.4, Apple only lets its own entitled processes read MediaRemote. [ungive/mediaremote-adapter](https://github.com/ungive/mediaremote-adapter) gets around this by running inside `/usr/bin/perl`, which Apple signs. `npm run build` self-tests it. A future macOS update could break it. An AppleScript fallback for Music.app would be the plan B, and `bridge/nowplaying/mediaremote.js` documents the interface such a source would implement.
- **Only one source at a time.** Control Center can list several players; this shows the one macOS considers current.
- **Browser video artwork is low resolution.** YouTube only exposes a small thumbnail, and it's centre-cropped to the square panel, so the sides of a 16:9 frame are cut off. The crop happens on the Mac at the source's own resolution, which keeps it as sharp as the thumbnail allows.
- **Non-Latin scripts.** The device has no CJK font, so Japanese, Chinese or Korean titles render as boxes. Adding a Noto Sans CJK subset to `ui/fonts` would fix it.
- **Volume depends on the output device.** HDMI, S/PDIF and some USB DACs have no software volume. The screen then says "No volume control on …".
- **Weather data.** Your location leaves the Mac rounded to about 1 km, and only to Open-Meteo. Hourly and daily labels use the forecast place's own timezone.
- **Rebuilding the helper can reset its permissions.** `CarThingHelper.app` is ad-hoc signed, so after changing and rebuilding `native/helper/` macOS may ask for Location and Calendars again. `npm run build` skips the helper when its source hasn't changed.
- **Single press delay.** A single knob press waits `multiClickMs` (350 ms) to see whether a second press follows, so play/pause reacts slightly later than it would without double and triple presses.
- **No real suspend.** Sleep means backlight off, CPU idled and the UI stopped redrawing. Chromium stays loaded so waking is instant, and the device keeps drawing a little current as long as the cable does.
- **Waking takes up to a second.** While the Mac is away, `sleepd.sh` notices a button or knob event on its next one-second poll rather than instantly.

## Layout

```
bridge/           Mac-side Node app (config.js: buttons, knob, volume…; settings.js: user settings)
  nowplaying/     MediaRemote source, artwork re-encoding (sips → ≤480px JPEG), app names/icons
  widgets/        weather (Open-Meteo) and calendar feeds
  mac/            CarThingHelper wrapper, Mac light/dark detection
  settings-page/  the http://127.0.0.1:4747 page
  audio/          volumectl wrapper
  device/         adb, minimal CDP client, UI sync, connection lifecycle
native/           Swift helpers + build script (output in native/bin, git-ignored)
  helper/         CarThingHelper.app source (location + calendar)
ui/               everything that runs on the Car Thing (800×480)
  js/             core.js (channel, input, screens, volume) + one file per screen
  css/            base.css (layout, dark/light palettes) + one file per screen
device/           sleepd.sh — the device's own sleep watchdog, installed by setup-device
scripts/          device setup/restore, screenshot, LaunchAgent
vendor/           mediaremote-adapter source (cloned by native/build.sh, git-ignored)
```

## Credits

- [ungive/mediaremote-adapter](https://github.com/ungive/mediaremote-adapter) (BSD-3-Clause), cloned and built by `npm run build`.
- [Inter](https://rsms.me/inter/) by Rasmus Andersson and [Merriweather](https://github.com/EbenSorkin/Merriweather4) by Eben Sorkin (both SIL Open Font License), bundled in `ui/fonts`.
