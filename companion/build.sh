#!/bin/zsh
# Builds and installs MacThing Menu.app to ~/Applications, ad-hoc signed, and a login LaunchAgent.
set -euo pipefail
here=${0:A:h}
out=$here/build
app="$HOME/Applications/MacThing Menu.app"
rm -rf $out && mkdir -p $out/AppIcon.iconset
swiftc -O -wmo -target arm64-apple-macos13 -o $out/MacThingMenu $here/main.swift -framework AppKit
src=$here/../assets/icon/macthing.svg
if [[ -f $src ]] && command -v magick >/dev/null; then
  for s in 16 32 128 256 512; do
    magick -background none -density 1200 $src -resize ${s}x${s} $out/AppIcon.iconset/icon_${s}x${s}.png
    magick -background none -density 1200 $src -resize $((s*2))x$((s*2)) $out/AppIcon.iconset/icon_${s}x${s}@2x.png
  done
  iconutil -c icns $out/AppIcon.iconset -o $out/AppIcon.icns
else
  echo "• no assets/icon/macthing.svg or ImageMagick: building without an app icon"
fi
pkill -x MacThingMenu || true
rm -rf "$app"; mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp $here/Info.plist "$app/Contents/"
cp $out/MacThingMenu "$app/Contents/MacOS/"
[[ -f $out/AppIcon.icns ]] && cp $out/AppIcon.icns "$app/Contents/Resources/"
codesign --force --sign - "$app"
agent=$HOME/Library/LaunchAgents/com.carthing.menu.plist
sed "s|HOME|$HOME|" $here/com.carthing.menu.plist > $agent
launchctl bootout gui/$(id -u)/com.carthing.menu 2>/dev/null || true
launchctl bootstrap gui/$(id -u) $agent
echo "installed $app (login item: $agent)"
