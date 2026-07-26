[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$workbenchRoot = Join-Path $repoRoot "tools\content-workbench"
$tauriCommand = Join-Path $repoRoot "node_modules\.bin\tauri.cmd"
$tauriConfigPath = Join-Path $workbenchRoot "src-tauri\tauri.conf.json"
$packagePath = Join-Path $workbenchRoot "package.json"
$cargoManifestPath = Join-Path $workbenchRoot "src-tauri\Cargo.toml"

if (-not (Test-Path -LiteralPath $tauriCommand -PathType Leaf)) {
    throw "Tauri CLI is missing. Run npm.cmd ci from the repository root first."
}

$tauriConfig = Get-Content -Raw -Encoding utf8 -LiteralPath $tauriConfigPath | ConvertFrom-Json
$package = Get-Content -Raw -Encoding utf8 -LiteralPath $packagePath | ConvertFrom-Json
$cargoManifest = Get-Content -Raw -Encoding utf8 -LiteralPath $cargoManifestPath

if ($cargoManifest -notmatch '(?ms)^\[package\].*?^version\s*=\s*"([^"]+)"') {
    throw "Unable to read the Cargo package version."
}

$versions = @($tauriConfig.version, $package.version, $Matches[1]) | Select-Object -Unique
if ($versions.Count -ne 1) {
    throw "Tauri, npm, and Cargo versions must match before packaging."
}

$remapFlags = @("--remap-path-prefix=$repoRoot=workspace")
if ($env:USERPROFILE) {
    $userProfile = [System.IO.Path]::GetFullPath($env:USERPROFILE)
    $remapFlags += "--remap-path-prefix=$userProfile=user-home"
}

$separator = [char]0x1f
if ($env:CARGO_ENCODED_RUSTFLAGS) {
    $remapFlags = @($env:CARGO_ENCODED_RUSTFLAGS -split $separator) + $remapFlags
}
$env:CARGO_ENCODED_RUSTFLAGS = $remapFlags -join $separator

Push-Location $workbenchRoot
try {
    & $tauriCommand build --bundles nsis
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri installer build failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
