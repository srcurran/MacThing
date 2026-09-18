#!/bin/zsh
# Reverts scripts/setup-device.sh: restores Spotify's web app and supervisord config, then reboots.
set -euo pipefail

serial=$(adb devices -l | awk '/spotify-car-thing|Car_Thing/ && $2=="device" {print $1; exit}')
[[ -n "$serial" ]] || { echo "No Car Thing found over adb" >&2; exit 1; }

adb -s "$serial" shell '
set -e
mount -o remount,rw /
trap "sync; mount -o remount,ro /" EXIT
cd /usr/share/qt-superbird-app
if [ -L webapp ] && [ -d webapp.spotify ]; then rm webapp && mv webapp.spotify webapp && echo "• web app restored"; fi
if [ -f /etc/supervisord.conf.spotify ]; then mv /etc/supervisord.conf.spotify /etc/supervisord.conf && echo "• supervisord.conf restored"; fi
'
echo "Rebooting the Car Thing…"
adb -s "$serial" shell 'sync; reboot' || true
