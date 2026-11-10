#!/bin/bash
set -euo pipefail

readonly USAGE_ERROR=64
readonly PREVIEW_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_ROOT="$(cd "$PREVIEW_ROOT/../.." && pwd)"
readonly TARGET="${CARGO_TARGET_DIR:-$PREVIEW_ROOT/target}"
readonly BUNDLE="$TARGET/bundle/Kiroshi.app"
readonly SIDECARS="$REPO_ROOT/apps/app/sidecar/binaries"
readonly ENTITLEMENTS="$PREVIEW_ROOT/scripts/entitlements.plist"
readonly PLIST_BUDDY=/usr/libexec/PlistBuddy

if [ $# -ne 3 ]; then
	echo "package-macos.sh: usage: package-macos.sh <target-triple> <version> <output-folder>" >&2
	exit "$USAGE_ERROR"
fi
readonly TRIPLE=$1
readonly VERSION=$2
readonly OUTPUT=$3
readonly DMG="$OUTPUT/Kiroshi_${VERSION}_${TRIPLE%%-*}.dmg"
readonly UPDATE="$OUTPUT/Kiroshi_${VERSION}_${TRIPLE%%-*}.app.tar.gz"

signed() {
	codesign --force --options runtime --timestamp --entitlements "$ENTITLEMENTS" \
		--sign "$APPLE_SIGNING_IDENTITY" "$1"
}

"$PREVIEW_ROOT/scripts/bundle-macos.sh" "$TRIPLE" "$VERSION"

for sidecar in "$SIDECARS/"*"-$TRIPLE"; do
	beside="$BUNDLE/Contents/MacOS/$(basename "$sidecar" "-$TRIPLE")"
	cp -f "$sidecar" "$beside"
	signed "$beside"
done
mkdir -p "$BUNDLE/Contents/Resources"
cp -f "$PREVIEW_ROOT/assets/icons/icon.icns" "$BUNDLE/Contents/Resources/icon.icns"
"$PLIST_BUDDY" -c "Add :CFBundleIconFile string icon.icns" "$BUNDLE/Contents/Info.plist"
signed "$BUNDLE"
codesign --verify --strict --deep "$BUNDLE"

mkdir -p "$OUTPUT"
hdiutil create -volname Kiroshi -srcfolder "$BUNDLE" -ov -format UDZO "$DMG"
codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$DMG"

notarised=$(xcrun notarytool submit "$DMG" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" \
	--team-id "$APPLE_TEAM_ID" --wait --output-format json)
status=$(jq -r .status <<<"$notarised")
if [ "$status" != Accepted ]; then
	echo "package-macos.sh: notarisation of $(basename "$DMG") ended $status: $notarised" >&2
	exit 1
fi
xcrun stapler staple "$DMG"
xcrun stapler staple "$BUNDLE"
tar -czf "$UPDATE" -C "$(dirname "$BUNDLE")" "$(basename "$BUNDLE")"
echo "$DMG"
echo "$UPDATE"
