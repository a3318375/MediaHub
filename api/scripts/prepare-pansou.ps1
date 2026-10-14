$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$submodule = Join-Path $repo 'third_party/pansou'
if (-not (Test-Path -LiteralPath (Join-Path $submodule 'go.mod'))) { throw 'Initialize PanSou first: git submodule update --init --recursive' }
$hooks = @(
 @{ Source = 'plugin/plugin.go'; Symbol = 'func WaitForAsyncTasks'; Patch = 'pansou-lifecycle.patch'; Companion = 'util/cache/sharded_memory_cache.go'; CompanionSymbol = 'func StopGlobalCleanupTask' },
 @{ Source = 'service/check_service.go'; Symbol = 'func NewCheckServiceWithCachePath'; Patch = 'pansou-check-lifecycle.patch'; Companion = 'service/check_service.go'; CompanionSymbol = 'func (s *CheckService) Close' }
)
foreach ($hook in $hooks) {
 $ready = (Select-String -LiteralPath (Join-Path $submodule $hook.Source) -SimpleMatch $hook.Symbol -Quiet) -and (Select-String -LiteralPath (Join-Path $submodule $hook.Companion) -SimpleMatch $hook.CompanionSymbol -Quiet)
 if ($ready) { continue }
 $patch = Join-Path $repo ('third_party/' + $hook.Patch)
 git -C $submodule apply --check $patch
 if ($LASTEXITCODE -ne 0) { throw "Embedding patch no longer applies: $($hook.Patch). Inspect upstream changes before building." }
 git -C $submodule apply $patch
 if ($LASTEXITCODE -ne 0) { throw "Failed to apply $($hook.Patch)." }
}
Write-Host 'PanSou embedding lifecycle hooks verified.'