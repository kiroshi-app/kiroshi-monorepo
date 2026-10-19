#!/bin/sh
if [ -n "${CI+set}" ] || ! command -v sccache >/dev/null 2>&1; then
	exec "$@"
fi
previous=
is_proc_macro=
for arg; do
	if [ "$previous" = --crate-type ] && [ "$arg" = proc-macro ]; then
		is_proc_macro=1
	fi
	previous=$arg
done
if [ -n "$is_proc_macro" ]; then
	set -- "$@" -C rpath
fi
if [ -n "${OUT_DIR-}" ]; then
	set -- "$@" "--remap-path-prefix=$OUT_DIR=OUT_DIR"
fi
exec sccache "$@"
