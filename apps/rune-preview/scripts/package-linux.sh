#!/bin/bash
set -euo pipefail

readonly USAGE_ERROR=64
readonly PREVIEW_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_ROOT="$(cd "$PREVIEW_ROOT/../.." && pwd)"
readonly TARGET="${CARGO_TARGET_DIR:-$PREVIEW_ROOT/target}"
readonly TRIPLE=x86_64-unknown-linux-gnu
readonly EXECUTABLE=kiroshi-rune-preview
readonly TAURI_APP="$REPO_ROOT/apps/app/src-tauri"
readonly APP_DIR="$TARGET/bundle/Kiroshi-Rune-Preview.AppDir"
readonly APPIMAGETOOL_URL=https://github.com/AppImage/appimagetool/releases/download/1.9.0/appimagetool-x86_64.AppImage
readonly APPIMAGETOOL_SHA256=46fdd785094c7f6e545b61afcfb0f3d98d8eab243f644b4b17698c01d06083d1

if [ $# -ne 2 ]; then
	echo "package-linux.sh: usage: package-linux.sh <version> <output-folder>" >&2
	exit "$USAGE_ERROR"
fi
readonly VERSION=$1
readonly OUTPUT=$2
readonly APPIMAGE="$OUTPUT/Kiroshi-Rune-Preview_${VERSION}_amd64.AppImage"
readonly APPIMAGETOOL="$TARGET/appimagetool-x86_64.AppImage"

(cd "$PREVIEW_ROOT" && cargo build -p kiroshi-rune-preview --bin "$EXECUTABLE" --release --locked --target "$TRIPLE")

mkdir -p "$APP_DIR/usr/bin" "$OUTPUT"
cp -f "$TARGET/$TRIPLE/release/$EXECUTABLE" "$APP_DIR/usr/bin/$EXECUTABLE"
for sidecar in "$TAURI_APP/binaries/"*"-$TRIPLE"; do
	cp -f "$sidecar" "$APP_DIR/usr/bin/$(basename "$sidecar" "-$TRIPLE")"
done
cp -f "$TAURI_APP/icons/128x128.png" "$APP_DIR/$EXECUTABLE.png"
ln -sf "usr/bin/$EXECUTABLE" "$APP_DIR/AppRun"
cat >"$APP_DIR/$EXECUTABLE.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Kiroshi Rune Preview
Exec=$EXECUTABLE %u
Icon=$EXECUTABLE
Categories=Development;
MimeType=x-scheme-handler/kiroshi;
DESKTOP

curl --fail --silent --show-error --location --output "$APPIMAGETOOL" "$APPIMAGETOOL_URL"
echo "$APPIMAGETOOL_SHA256  $APPIMAGETOOL" | sha256sum --check --quiet
chmod +x "$APPIMAGETOOL"
APPIMAGE_EXTRACT_AND_RUN=1 ARCH=x86_64 "$APPIMAGETOOL" --no-appstream "$APP_DIR" "$APPIMAGE"
echo "$APPIMAGE"
