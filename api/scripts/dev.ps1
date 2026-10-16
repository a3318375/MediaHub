# Start the API with the current Windows user proxy unless explicitly overridden.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not $env:MEDIAHUB_DATA_DIR) {
 $env:MEDIAHUB_DATA_DIR = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'data'
}
$env:MEDIAHUB_DATA_DIR = [System.IO.Path]::GetFullPath($env:MEDIAHUB_DATA_DIR)
Write-Host "Persistent data directory: $env:MEDIAHUB_DATA_DIR"
& (Join-Path $PSScriptRoot "initialize-environment.ps1")
& (Join-Path $PSScriptRoot "prepare-pansou.ps1")
& (Join-Path $PSScriptRoot "generate-pansou.ps1") -Check
go run ./cmd/server
exit $LASTEXITCODE
