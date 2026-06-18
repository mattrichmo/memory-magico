#!/bin/sh
set -e

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$DIR/bin/mm.mjs" "$@"
