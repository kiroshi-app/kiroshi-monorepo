#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../../.."

STORE_SIMULATOR="Store iPhone 17 Pro Max"
SIGNED_OUT_SIMULATOR="Store iPhone 17 Pro Max, signed out"
DEVICE_TYPE="iPhone 17 Pro Max"
RUNTIME=com.apple.CoreSimulator.SimRuntime.iOS-27-0
OUTPUT=apps/ios/store/screenshots/6.9
WORK=apps/ios/build/store-screenshots
SCREENSHOTS=(01-sign-in 02-conversations 03-thread 04-missions 05-settings)

udid_of() {
	xcrun simctl list devices "iOS 27.0" | grep -F "    $1 (" | grep -oE '[0-9A-F-]{36}' | head -1 || true
}

prepare() {
	xcrun simctl boot "$1" 2>/dev/null || true
	xcrun simctl bootstatus "$1" -b >/dev/null
	if [ "$(xcrun simctl spawn "$1" defaults read -g AppleLocale 2>/dev/null || true)" != en_US ]; then
		xcrun simctl spawn "$1" defaults write -g AppleLocale en_US
		xcrun simctl spawn "$1" defaults write -g AppleLanguages -array en
		xcrun simctl shutdown "$1"
		xcrun simctl boot "$1"
		xcrun simctl bootstatus "$1" -b >/dev/null
	fi
	xcrun simctl ui "$1" appearance light
	xcrun simctl status_bar "$1" override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4
}

run_test() {
	TEST_RUNNER_STORE_SPACE="${STORE_SPACE:-}" \
		TEST_RUNNER_STORE_CONVERSATION="${STORE_CONVERSATION:-}" \
		apps/ios/scripts/xcodebuild.sh -project apps/ios/Kiroshi.xcodeproj -scheme Kiroshi -testPlan StoreScreenshots \
		-destination "platform=iOS Simulator,id=$1" -derivedDataPath apps/ios/build \
		-parallel-testing-enabled NO -collect-test-diagnostics never -quiet \
		-resultBundlePath "$WORK/$2.xcresult" test-without-building "-only-testing:KiroshiUITests/StoreScreenshots/$2"
}

STORE_UDID=$(udid_of "$STORE_SIMULATOR")
if [ -z "$STORE_UDID" ]; then
	STORE_UDID=$(xcrun simctl create "$STORE_SIMULATOR" "$DEVICE_TYPE" "$RUNTIME")
fi
STALE_UDID=$(udid_of "$SIGNED_OUT_SIMULATOR")
if [ -n "$STALE_UDID" ]; then
	xcrun simctl delete "$STALE_UDID"
fi
SIGNED_OUT_UDID=$(xcrun simctl create "$SIGNED_OUT_SIMULATOR" "$DEVICE_TYPE" "$RUNTIME")
trap 'xcrun simctl shutdown "$SIGNED_OUT_UDID" 2>/dev/null || true; xcrun simctl delete "$SIGNED_OUT_UDID"' EXIT
prepare "$STORE_UDID"
prepare "$SIGNED_OUT_UDID"

xcodegen generate --spec apps/ios/project.yml
rm -rf "$WORK"
mkdir -p "$WORK"
apps/ios/scripts/xcodebuild.sh -project apps/ios/Kiroshi.xcodeproj -scheme Kiroshi -testPlan StoreScreenshots \
	-destination "platform=iOS Simulator,id=$STORE_UDID" -derivedDataPath apps/ios/build -quiet build-for-testing

run_test "$SIGNED_OUT_UDID" testSignIn

if ! run_test "$STORE_UDID" testSignedInScreens; then
	if xcrun xcresulttool get test-results tests --path "$WORK/testSignedInScreens.xcresult" |
		grep -q "No session on this simulator"; then
		xcrun simctl launch "$STORE_UDID" com.kiroshi.app.ios >/dev/null
		open "devices://device/open?id=$STORE_UDID"
		cat <<EOF

The "$STORE_SIMULATOR" simulator has no session yet. Kiroshi is open on it:
type your email, tap Continue, then type the code from your mailbox.
Once the Conversations tab shows, run bun run ios:screenshots again.
EOF
	fi
	exit 1
fi

for test in testSignIn testSignedInScreens; do
	xcrun xcresulttool export attachments --path "$WORK/$test.xcresult" --output-path "$WORK/$test"
done
mkdir -p "$OUTPUT"
python3 -I - "$WORK" "$OUTPUT" "${SCREENSHOTS[@]}" <<'EOF'
import json, shutil, sys
work, output, *screenshots = sys.argv[1:]
for test in ("testSignIn", "testSignedInScreens"):
    for entry in json.load(open(f"{work}/{test}/manifest.json")):
        for attachment in entry["attachments"]:
            name = attachment["suggestedHumanReadableName"].split("_")[0]
            if name in screenshots:
                shutil.copyfile(f"{work}/{test}/{attachment['exportedFileName']}", f"{output}/{name}.png")
EOF

for screenshot in "${SCREENSHOTS[@]}"; do
	size=$(sips -g pixelWidth -g pixelHeight "$OUTPUT/$screenshot.png" 2>/dev/null | awk '/pixel/ { printf "%s ", $2 }')
	if [ "$size" != "1320 2868 " ]; then
		echo "$screenshot.png is ${size:-missing}, not 1320 x 2868." >&2
		exit 1
	fi
	echo "$screenshot.png 1320 x 2868"
done
