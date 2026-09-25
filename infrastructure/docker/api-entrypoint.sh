#!/bin/sh
set -eu
# Run as node (UID/GID 1000). Never recursively change ownership of host data.
if ! mkdir -p "$DEV_DATA_DIR/imports" "$DEV_DATA_DIR/exports" "$DEV_DATA_DIR/config"; then
  echo 'Cannot create persistent data directories. Mount dev_data writable by UID/GID 1000.' >&2
  exit 1
fi
if [ ! -w "$DEV_DATA_DIR/imports" ] || [ ! -w "$DEV_DATA_DIR/exports" ]; then
  echo 'Persistent imports/exports directories must be writable by UID/GID 1000.' >&2
  exit 1
fi
exec "$@"
