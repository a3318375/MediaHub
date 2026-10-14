param([switch]$VerifyOnly, [string]$Ref)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'initialize-environment.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$submodule = Join-Path $repo 'third_party/pansou'
function Require-Success([string]$Message) { if ($LASTEXITCODE -ne 0) { throw $Message } }
function Normalize-Patch([string]$Value) { return $Value.Replace("`r`n", "`n").Trim() }
$groups = @(
 @{ Files = @('plugin/plugin.go', 'util/cache/sharded_memory_cache.go'); Patch = 'pansou-lifecycle.patch' },
 @{ Files = @('service/check_service.go'); Patch = 'pansou-check-lifecycle.patch' }
)
$allowed = @($groups | ForEach-Object { $_.Files })
$originalRevision = git -C $submodule rev-parse HEAD
Require-Success 'Cannot read PanSou revision.'
$dirty = @(git -C $submodule status --porcelain)
Require-Success 'Cannot inspect PanSou changes.'
foreach ($line in $dirty) {
 $name = $line.Substring(3).Replace('\','/')
 if ($name -notin $allowed) { throw "PanSou contains an unrecorded local change: $name. Preserve it before updating." }
}
foreach ($group in $groups) {
 $diff = (git -C $submodule diff HEAD -- $group.Files) -join "`n"
 Require-Success 'Cannot read embedding changes.'
 if ($diff.Trim()) {
  $recorded = [IO.File]::ReadAllText((Join-Path $repo ('third_party/' + $group.Patch)))
  if ((Normalize-Patch $diff) -ne (Normalize-Patch $recorded)) { throw "Local embedding changes differ from $($group.Patch); refusing to discard them." }
 }
}
# Preserve existing root edits byte-for-byte, including module files and generated sources.
$protected = @('go.mod','go.sum','internal/pansoubridge/plugins_generated.go','internal/pansoubridge/defaults_generated.go')
$snapshot = @{}
foreach ($relative in $protected) {
 $path = Join-Path $repo $relative
 $snapshot[$path] = if (Test-Path -LiteralPath $path) { [IO.File]::ReadAllBytes($path) } else { $null }
}
foreach ($relative in $allowed) {
 $path = Join-Path $submodule $relative
 $snapshot[$path] = [IO.File]::ReadAllBytes($path)
}
$changed = $false
$buildFile = Join-Path $env:TEMP ('media-center-update-' + [Guid]::NewGuid().ToString('N') + '.exe')
Push-Location $repo
try {
 if (-not $VerifyOnly) {
  # Resolve an explicit revision before touching the checkout.
  if ($Ref) { $target = git -C $submodule rev-parse --verify ($Ref + '^{commit}'); Require-Success 'Unknown PanSou revision.' }
  $changed = $true
  git -C $submodule restore -- $allowed
  Require-Success 'Cannot remove the verified embedding patches.'
  if ($Ref) { git -C $submodule checkout --detach $target; Require-Success 'Cannot select PanSou revision.' }
  else { git submodule update --init --remote -- third_party/pansou; Require-Success 'PanSou update failed.' }
 }
 & (Join-Path $PSScriptRoot 'prepare-pansou.ps1')
 if ($VerifyOnly) { & (Join-Path $PSScriptRoot 'generate-pansou.ps1') -Check }
 else { & (Join-Path $PSScriptRoot 'generate-pansou.ps1') }
 $module = Get-Content (Join-Path $submodule 'go.mod') -Raw
 if ($module -notmatch '(?m)^module\s+pansou\s*$') { throw 'PanSou module path changed.' }
 $rootModule = Get-Content (Join-Path $repo 'go.mod') -Raw
 if ($rootModule -notmatch '(?m)^\s*pansou\s+v\S+' -or $rootModule -notmatch '(?m)^replace\s+pansou\s+=>\s+\./third_party/pansou\s*$') { throw 'The local PanSou module requirement/replace is missing.' }
 if (-not $VerifyOnly) { go mod tidy; Require-Success 'go mod tidy failed.' }
 go test ./...
 Require-Success 'Regression tests failed.'
 go vet ./...
 Require-Success 'Static checks failed.'
 go build -o $buildFile ./cmd/server
 Require-Success 'Single-binary build failed.'
 Write-Host "PanSou verified: $(git -C $submodule rev-parse HEAD). Review and commit the updated submodule and generated files together."
} catch {
 if ($changed) {
  git -C $submodule restore -- $allowed
  Require-Success 'Could not remove generated embedding patches during rollback.'
  git -C $submodule checkout --detach $originalRevision
  Require-Success 'Could not restore the original PanSou revision.'
  foreach ($path in $snapshot.Keys) {
   if ($null -eq $snapshot[$path]) { if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force } }
   else { [IO.File]::WriteAllBytes($path, $snapshot[$path]) }
  }
  Write-Warning 'Update failed; original PanSou revision, embedding edits, module files and generated files restored.'
 }
 throw
} finally {
 if (Test-Path -LiteralPath $buildFile) { Remove-Item -LiteralPath $buildFile -Force }
 Pop-Location
}