#!/bin/bash
set -euo pipefail

readonly USAGE_ERROR=64
readonly PREVIEW_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_ROOT="$(cd "$PREVIEW_ROOT/../.." && pwd)"
readonly TARGET="${CARGO_TARGET_DIR:-$PREVIEW_ROOT/target}"
readonly TRIPLE=x86_64-unknown-linux-gnu
readonly EXECUTABLE=kiroshi-rune-preview
readonly IDENTIFIER=com.kiroshi.app
readonly INSTALLED_TAURI_EXECUTABLE=Kiroshi
readonly SIDECARS="$REPO_ROOT/apps/app/sidecar/binaries"
readonly PACKAGE_ROOT="$TARGET/bundle/deb"

if [ $# -ne 2 ]; then
	echo "package-linux.sh: usage: package-linux.sh <version> <output-folder>" >&2
	exit "$USAGE_ERROR"
fi
readonly VERSION=$1
readonly OUTPUT=$2
readonly DEB="$OUTPUT/Kiroshi_${VERSION}_amd64.deb"

(cd "$PREVIEW_ROOT" && cargo build -p kiroshi-rune-preview --bin "$EXECUTABLE" --release --locked --target "$TRIPLE")

rm -rf "$PACKAGE_ROOT"
mkdir -p "$PACKAGE_ROOT/DEBIAN" "$PACKAGE_ROOT/usr/bin" "$PACKAGE_ROOT/usr/share/applications" \
	"$PACKAGE_ROOT/usr/share/icons/hicolor/128x128/apps" "$OUTPUT"
install -m 0755 "$TARGET/$TRIPLE/release/$EXECUTABLE" "$PACKAGE_ROOT/usr/bin/$EXECUTABLE"
for sidecar in "$SIDECARS/"*"-$TRIPLE"; do
	install -m 0755 "$sidecar" "$PACKAGE_ROOT/usr/bin/$(basename "$sidecar" "-$TRIPLE")"
done
ln -s "$EXECUTABLE" "$PACKAGE_ROOT/usr/bin/$INSTALLED_TAURI_EXECUTABLE"
install -m 0644 "$PREVIEW_ROOT/assets/icons/128x128.png" \
	"$PACKAGE_ROOT/usr/share/icons/hicolor/128x128/apps/$IDENTIFIER.png"
cat >"$PACKAGE_ROOT/usr/share/applications/$IDENTIFIER.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Kiroshi
Exec=$EXECUTABLE %u
Icon=$IDENTIFIER
Categories=Development;
MimeType=x-scheme-handler/kiroshi;
DESKTOP
cat >"$PACKAGE_ROOT/DEBIAN/control" <<CONTROL
Package: kiroshi
Version: $VERSION
Architecture: amd64
Maintainer: Kiroshi
Section: devel
Priority: optional
Depends: libxkbcommon0
Description: Kiroshi
CONTROL

dpkg-deb --root-owner-group --build "$PACKAGE_ROOT" "$DEB"
echo "$DEB"
