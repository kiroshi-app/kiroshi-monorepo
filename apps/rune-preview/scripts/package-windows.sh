#!/bin/bash
set -euo pipefail

readonly USAGE_ERROR=64
readonly PREVIEW_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_ROOT="$(cd "$PREVIEW_ROOT/../.." && pwd)"
readonly TARGET="${CARGO_TARGET_DIR:-$PREVIEW_ROOT/target}"
readonly TRIPLE=x86_64-pc-windows-msvc
readonly EXECUTABLE=kiroshi-rune-preview.exe
readonly SIDECARS="$REPO_ROOT/apps/app/sidecar/binaries"
readonly STAGED="$TARGET/bundle/windows"

if [ $# -ne 2 ]; then
	echo "package-windows.sh: usage: package-windows.sh <version> <output-folder>" >&2
	exit "$USAGE_ERROR"
fi
readonly VERSION=$1
readonly OUTPUT=$2
readonly INSTALLER="$OUTPUT/Kiroshi_${VERSION}_x64-setup.exe"

(cd "$PREVIEW_ROOT" && cargo build -p kiroshi-rune-preview --bin kiroshi-rune-preview --release --locked --target "$TRIPLE")

mkdir -p "$STAGED" "$OUTPUT"
cp -f "$TARGET/$TRIPLE/release/$EXECUTABLE" "$STAGED/$EXECUTABLE"
for sidecar in "$SIDECARS/"*"-$TRIPLE.exe"; do
	cp -f "$sidecar" "$STAGED/$(basename "$sidecar" "-$TRIPLE.exe").exe"
done
cp -f "$PREVIEW_ROOT/assets/icons/icon.ico" "$STAGED/icon.ico"

makensis -V2 -DVERSION="$VERSION" -DSTAGED="$(cygpath -w "$STAGED")" \
	-DINSTALLER="$(cygpath -w "$INSTALLER")" "$(cygpath -w "$PREVIEW_ROOT/scripts/installer.nsi")"
echo "$INSTALLER"
