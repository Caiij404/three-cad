$runtimeDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) '.research/runtime/node-v24.21.0-win-x64'
if (-not (Test-Path -LiteralPath (Join-Path $runtimeDirectory 'node.exe'))) {
    throw 'Project Node is missing. Run ./scripts/setup-node.ps1 first.'
}
$env:Path = "$runtimeDirectory;$env:Path"
Write-Output "Current session Node: $(& (Join-Path $runtimeDirectory 'node.exe') --version)"
