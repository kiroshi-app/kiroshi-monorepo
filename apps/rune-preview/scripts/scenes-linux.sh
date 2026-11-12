#!/bin/bash
set -euo pipefail

readonly PREVIEW_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_ROOT="$(cd "$PREVIEW_ROOT/../.." && pwd)"
readonly IMAGE=kiroshi-scenes-linux
readonly PLATFORM=linux/amd64
readonly CHECKOUT=/kiroshi

docker build --platform "$PLATFORM" --tag "$IMAGE" - <<'DOCKERFILE'
FROM ubuntu:24.04
RUN apt-get update \
	&& apt-get install --yes --no-install-recommends \
		ca-certificates curl build-essential pkg-config libxkbcommon-dev mesa-vulkan-drivers \
	&& rm -rf /var/lib/apt/lists/*
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable
ENV PATH=/root/.cargo/bin:$PATH
DOCKERFILE

docker run --rm --platform "$PLATFORM" \
	--env KIROSHI_BLESS \
	--env CARGO_TARGET_DIR=/target \
	--volume "$REPO_ROOT:$CHECKOUT" \
	--volume "$IMAGE-target:/target" \
	--volume "$IMAGE-registry:/root/.cargo/registry" \
	--volume "$IMAGE-git:/root/.cargo/git" \
	--workdir "$CHECKOUT/apps/rune-preview" \
	"$IMAGE" cargo test -p kiroshi-rune-kit --test scenes --locked "$@"
