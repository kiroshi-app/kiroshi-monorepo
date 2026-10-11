#!/bin/bash
set -euo pipefail

XCODEGEN_VERSION=2.46.0
XCODEGEN_SHA256=4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806

repository="$CI_PRIMARY_REPOSITORY_PATH"
: "${CI_BUILD_NUMBER:?Xcode Cloud sets CI_BUILD_NUMBER, the build number never comes from git here}"

xcodebuild -version
pinned_xcode="$(cat "$repository/.xcode-version" 2>/dev/null || true)"
running_xcode="$(xcodebuild -version | awk 'NR == 1 { print $2 }')"
if [[ "$running_xcode" != "$pinned_xcode" ]]; then
  echo "warning: this workflow runs Xcode $running_xcode, .xcode-version pins ${pinned_xcode:-nothing}. Pick Xcode $pinned_xcode in the workflow's Environment."
fi

tools="$(mktemp -d)"
curl --fail --silent --show-error --location --retry 3 \
  --output "$tools/xcodegen.zip" \
  "https://github.com/yonaskolb/XcodeGen/releases/download/$XCODEGEN_VERSION/xcodegen.zip"
echo "$XCODEGEN_SHA256  $tools/xcodegen.zip" | shasum --algorithm 256 --check
unzip -q "$tools/xcodegen.zip" -d "$tools"
xcodegen="$tools/xcodegen/bin/xcodegen"
"$xcodegen" --version

cd "$repository/apps/ios"
"$xcodegen" generate --spec project.yml
cat BuildNumber.xcconfig
