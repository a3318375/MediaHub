#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
submodule="$repo/third_party/pansou"
if [ ! -f "$submodule/go.mod" ]; then
  echo 'Initialize PanSou first: git submodule update --init --recursive' >&2
  exit 1
fi
if ! grep -q 'func WaitForAsyncTasks' "$submodule/plugin/plugin.go" || ! grep -q 'func StopGlobalCleanupTask' "$submodule/util/cache/sharded_memory_cache.go"; then
  git -C "$submodule" apply --check "$repo/third_party/pansou-lifecycle.patch"
  git -C "$submodule" apply "$repo/third_party/pansou-lifecycle.patch"
fi
if ! grep -q 'func NewCheckServiceWithCachePath' "$submodule/service/check_service.go" || ! grep -q 'func (s \*CheckService) Close' "$submodule/service/check_service.go"; then
  git -C "$submodule" apply --check "$repo/third_party/pansou-check-lifecycle.patch"
  git -C "$submodule" apply "$repo/third_party/pansou-check-lifecycle.patch"
fi
printf '%s\n' 'PanSou embedding lifecycle hooks verified.'
