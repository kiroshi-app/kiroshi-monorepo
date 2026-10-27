FROM ubuntu:24.04@sha256:24737cef17f4e22b1977df7d9a05e77c4e28b7da5b8911f8d8ccda136bf3573c

LABEL org.opencontainers.image.source=https://github.com/kiroshi-app/kiroshi-monorepo

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		build-essential \
		ca-certificates \
		curl \
		git \
		libwebkit2gtk-4.1-dev \
		pkg-config \
		unzip \
		xz-utils \
		zstd \
	&& rm -rf /var/lib/apt/lists/* \
	&& useradd --uid 1001 runner
