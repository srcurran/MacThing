#!/bin/zsh
# One-time device setup (safe to re-run). Needs the Car Thing connected with adb access.
#
#  1. Points the boot web app (/usr/share/qt-superbird-app/webapp) at /var/lib/carthing/ui,
#     keeping Spotify's original as webapp.spotify. Future UI updates then never touch the
#     read-only rootfs — the bridge just syncs /var/lib/carthing/ui.
#  2. Stops Spotify's background app (qt-superbird-app) from autostarting: with no Spotify
#     service it only burns ~15% CPU on "Hey Spotify" wake-word listening and BT pairing.
#     The original supervisord.conf is kept as supervisord.conf.spotify.
#
# Undo everything with scripts/restore-device.sh.
set -euo pipefail

serial=$(adb devices -l | awk '/spotify-car-thing|Car_Thing/ && $2=="device" {print $1; exit}')
[[ -n "$serial" ]] || { echo "No Car Thing found over adb" >&2; exit 1; }

adb -s "$serial" shell '
set -e
mkdir -p /var/lib/carthing/ui
[ -f /var/lib/carthing/ui/index.html ] || echo "<body style=\"background:#121212\"></body>" > /var/lib/carthing/ui/index.html

mount -o remount,rw /
trap "sync; mount -o remount,ro /" EXIT

cd /usr/share/qt-superbird-app
if [ ! -L webapp ]; then
  mv webapp webapp.spotify
  ln -s /var/lib/carthing/ui webapp
  echo "• boot web app → /var/lib/carthing/ui (original kept as webapp.spotify)"
else
  echo "• boot web app already points at $(readlink webapp)"
fi

if [ ! -f /etc/supervisord.conf.spotify ]; then
  cp /etc/supervisord.conf /etc/supervisord.conf.spotify
  # flip autostart only inside the [program:superbird] section
  sed -i "/^\[program:superbird\]/,/^\[/ s/^autostart=true/autostart=false/" /etc/supervisord.conf
  echo "• qt-superbird-app autostart disabled (original kept as supervisord.conf.spotify)"
else
  echo "• supervisord already modified"
fi
supervisorctl stop superbird >/dev/null 2>&1 || true
'
echo "Done. Start the bridge (npm start) — it deploys the UI and takes over the screen."
