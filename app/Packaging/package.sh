#!/bin/bash
# Builds Commons.app (universal: Apple silicon + Intel), signs it ad hoc, zips it
# and puts the zip on the website with its size and SHA-256.
#
#   ./Packaging/package.sh            version from VERSION below
#   VERSION=0.2.0 ./Packaging/package.sh
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${VERSION:-0.1.0}"
BUILD="$(date +%Y%m%d%H%M)"
SITE="${SITE:-$HOME/Desktop/commons-website}"
OUT="Packaging/dist"
APP="$OUT/Commons.app"

echo "▸ Building Commons $VERSION"
if swift build -c release --arch arm64 --arch x86_64 >/dev/null 2>&1; then
  BIN=".build/apple/Products/Release/Commons"
  echo "  universal binary (Apple silicon + Intel)"
else
  swift build -c release
  BIN="$(swift build -c release --show-bin-path)/Commons"
  echo "  binary for this Mac's architecture only"
fi

echo "▸ Assembling Commons.app"
rm -rf "$OUT"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/Commons"
sed -e "s/__VERSION__/$VERSION/" -e "s/__BUILD__/$BUILD/" Packaging/Info.plist > "$APP/Contents/Info.plist"

ICONSET="$OUT/AppIcon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -s format png -z $s $s Packaging/AppIcon-1024.jpg --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -s format png -z $((s*2)) $((s*2)) Packaging/AppIcon-1024.jpg --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$ICONSET"

echo "▸ Signing (ad hoc)"
codesign --force --deep --sign - "$APP"

ZIP="Commons-$VERSION-macOS.zip"
echo "▸ Zipping $ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUT/$ZIP"
BYTES=$(stat -f%z "$OUT/$ZIP")
SHA=$(shasum -a 256 "$OUT/$ZIP" | cut -d' ' -f1)

if [ -d "$SITE" ]; then
  mkdir -p "$SITE/public/downloads"
  cp "$OUT/$ZIP" "$SITE/public/downloads/$ZIP"
  cat > "$SITE/src/data/app-release.json" <<JSON
{ "version": "$VERSION", "file": "$ZIP", "bytes": $BYTES, "sha256": "$SHA", "minMacOS": "14" }
JSON
  echo "▸ Copied to the website: public/downloads/$ZIP"
fi
echo "✓ $OUT/$ZIP  ($BYTES bytes)  sha256 $SHA"
