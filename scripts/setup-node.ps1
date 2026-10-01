$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeVersion = '24.21.0'
$zipName = "node-v$nodeVersion-win-x64.zip"
$expectedHash = '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541'
$runtimeRoot = Join-Path $projectRoot '.research/runtime'
$runtimeDirectory = Join-Path $runtimeRoot "node-v$nodeVersion-win-x64"
$nodeExecutable = Join-Path $runtimeDirectory 'node.exe'

if (-not (Test-Path -LiteralPath $nodeExecutable)) {
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    $zipPath = Join-Path $runtimeRoot $zipName
    & curl.exe -fsSL --retry 2 -o $zipPath "https://nodejs.org/dist/v$nodeVersion/$zipName"
    if ($LASTEXITCODE -ne 0) { throw 'Node download failed' }
    $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) { throw 'Node archive SHA-256 mismatch' }
    Expand-Archive -LiteralPath $zipPath -DestinationPath $runtimeRoot
}

$actualVersion = & $nodeExecutable --version
if ($actualVersion -ne "v$nodeVersion") { throw "Unexpected Node version: $actualVersion" }
Write-Output "Verified Node $actualVersion at $runtimeDirectory"
Write-Output 'Run . ./scripts/use-node.ps1 in the current PowerShell session to use it.'
