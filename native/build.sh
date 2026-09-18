#!/bin/zsh
# Builds the two native pieces the bridge needs:
#   native/bin/volumectl                         CoreAudio volume helper (Swift)
#   native/bin/appinfo                           app name + icon lookup by bundle id (Swift)
#   native/bin/MediaRemoteAdapter.framework      ungive/mediaremote-adapter, loaded by /usr/bin/perl
# No cmake required — the adapter is small enough to build with clang directly.
set -euo pipefail

ROOT="${0:A:h:h}"
OUT="$ROOT/native/bin"
ADAPTER="$ROOT/vendor/mediaremote-adapter"
ADAPTER_TAG="v0.7.7"
mkdir -p "$OUT"

if [[ ! -d "$ADAPTER" ]]; then
  git clone -q --depth 1 --branch "$ADAPTER_TAG" https://github.com/ungive/mediaremote-adapter.git "$ADAPTER"
fi

echo "• volumectl, appinfo"
swiftc -O -o "$OUT/volumectl" "$ROOT/native/volumectl.swift"
swiftc -O -o "$OUT/appinfo" "$ROOT/native/appinfo.swift"

echo "• MediaRemoteAdapter.framework ($ADAPTER_TAG)"
FW="$OUT/MediaRemoteAdapter.framework"
rm -rf "$FW"
mkdir -p "$FW/Versions/A/Resources"
clang -dynamiclib -arch arm64 -arch x86_64 -fobjc-arc -fvisibility=default -w \
  -I"$ADAPTER/include" -I"$ADAPTER/src" \
  "$ADAPTER"/src/adapter/*.m "$ADAPTER"/src/private/MediaRemote.m "$ADAPTER"/src/utility/*.m \
  -framework Foundation -framework AppKit -framework UniformTypeIdentifiers \
  -install_name @rpath/MediaRemoteAdapter.framework/Versions/A/MediaRemoteAdapter \
  -o "$FW/Versions/A/MediaRemoteAdapter"
cat > "$FW/Versions/A/Resources/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>MediaRemoteAdapter</string>
<key>CFBundleIdentifier</key><string>com.vandenbe.MediaRemoteAdapter</string>
<key>CFBundleName</key><string>MediaRemoteAdapter</string>
<key>CFBundlePackageType</key><string>FMWK</string>
<key>CFBundleShortVersionString</key><string>0.1</string>
<key>CFBundleVersion</key><string>0.1.0</string>
</dict></plist>
EOF
ln -s A "$FW/Versions/Current"
ln -s Versions/Current/MediaRemoteAdapter "$FW/MediaRemoteAdapter"
ln -s Versions/Current/Resources "$FW/Resources"
codesign --force --deep --sign - "$FW" 2>/dev/null
cp "$ADAPTER/bin/mediaremote-adapter.pl" "$OUT/"

echo "• self-test"
if /usr/bin/perl "$OUT/mediaremote-adapter.pl" "$FW" get --no-artwork >/dev/null; then
  echo "  MediaRemote adapter OK"
else
  echo "  MediaRemote adapter FAILED — now playing will not work on this macOS version" >&2
  exit 1
fi
