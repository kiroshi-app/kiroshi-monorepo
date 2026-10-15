#!/bin/sh
if [ -z "${CI+set}" ] && command -v sccache >/dev/null 2>&1; then
	exec sccache "$@"
fi
exec "$@"
