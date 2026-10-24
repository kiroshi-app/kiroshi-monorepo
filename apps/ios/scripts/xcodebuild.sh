#!/bin/bash
set -euo pipefail

if [ -n "${CI:-}" ]; then
	exec xcodebuild "$@"
fi

SHARED_CACHES="$HOME/Library/Caches/kiroshi-ios"
IOS_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
REPO_DIR="$(cd "$IOS_DIR/../.." && pwd -P)"
STANDARDIZED_IOS_DIR="${IOS_DIR#/private}"
WORKTREE_PREFIX_MAPS="$IOS_DIR/build=/^derived-data $IOS_DIR/Kiroshi.xcodeproj=/^project"
if [ "$STANDARDIZED_IOS_DIR" != "$IOS_DIR" ]; then
	WORKTREE_PREFIX_MAPS+=" $STANDARDIZED_IOS_DIR/build=/^derived-data $STANDARDIZED_IOS_DIR/Kiroshi.xcodeproj=/^project"
fi

exec "$REPO_DIR/scripts/slot.sh" xcodebuild "$@" \
	-clonedSourcePackagesDirPath "$SHARED_CACHES/SourcePackages" \
	COMPILATION_CACHE_ENABLE_CACHING=YES \
	COMPILATION_CACHE_CAS_PATH="$SHARED_CACHES/CompilationCache.noindex" \
	SWIFT_ENABLE_PREFIX_MAPPING=YES \
	CLANG_ENABLE_PREFIX_MAPPING=YES \
	SWIFT_OTHER_PREFIX_MAPPINGS="$WORKTREE_PREFIX_MAPS" \
	CLANG_OTHER_PREFIX_MAPPINGS="$WORKTREE_PREFIX_MAPS"
