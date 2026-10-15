#!/bin/bash
set -euo pipefail

if [ -n "${CI:-}" ]; then
	exec xcodebuild "$@"
fi

exec xcodebuild "$@" -clonedSourcePackagesDirPath "$HOME/Library/Caches/kiroshi-ios/SourcePackages"
