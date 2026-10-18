#!/bin/sh
if [ -z "${CI+set}" ] && command -v sccache >/dev/null 2>&1; then
	if [ -n "${OUT_DIR-}" ]; then
		exec sccache "$@" -C rpath "--remap-path-prefix=$OUT_DIR=OUT_DIR"
	fi
	exec sccache "$@" -C rpath
fi
exec "$@"
