#!/bin/bash
set -euo pipefail

readonly USAGE_ERROR=64
readonly PREVIEW_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_ROOT="$(cd "$PREVIEW_ROOT/../.." && pwd)"
readonly TARGET="${CARGO_TARGET_DIR:-$PREVIEW_ROOT/target}"
readonly EXECUTABLE=kiroshi-rune-preview
readonly BUNDLE="$TARGET/bundle/Kiroshi Rune Preview.app"
readonly LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
readonly RELEASE_TRIPLE="${1:-}"
readonly VERSION="${2:-0.0.0}"

if [ "$(uname -s)" != Darwin ]; then
	echo "bundle-macos.sh: macOS only; elsewhere run the binary with --register-scheme" >&2
	exit "$USAGE_ERROR"
fi

if [ -n "$RELEASE_TRIPLE" ]; then
	build=(--release --locked --target "$RELEASE_TRIPLE")
	built="$TARGET/$RELEASE_TRIPLE/release/$EXECUTABLE"
else
	build=()
	built="$TARGET/debug/$EXECUTABLE"
fi

cd "$PREVIEW_ROOT"
"$REPO_ROOT/scripts/slot.sh" cargo build -p kiroshi-rune-preview --bin "$EXECUTABLE" ${build[@]+"${build[@]}"}

mkdir -p "$BUNDLE/Contents/MacOS"
cp -f "$built" "$BUNDLE/Contents/MacOS/$EXECUTABLE"
cat >"$BUNDLE/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleIdentifier</key>
	<string>com.kiroshi.rune-preview</string>
	<key>CFBundleName</key>
	<string>Kiroshi Rune Preview</string>
	<key>CFBundleExecutable</key>
	<string>$EXECUTABLE</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>$VERSION</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>com.kiroshi.rune-preview</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>kiroshi</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
PLIST

"$LSREGISTER" -f "$BUNDLE"
echo "$BUNDLE"
