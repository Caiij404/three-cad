param([string]$BootstrapPython = 'python')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
New-Item -ItemType Directory -Path .research/tools -Force | Out-Null
if (-not (Test-Path -LiteralPath .research/solvespace-src/.git)) {
    git clone --filter=blob:none --no-checkout https://github.com/solvespace/solvespace.git .research/solvespace-src
    if ($LASTEXITCODE -ne 0) { throw 'SolveSpace clone failed' }
    git -C .research/solvespace-src fetch --depth 1 origin 2879a02d2866e103d7a4817721ead9ac43558aea
    if ($LASTEXITCODE -ne 0) { throw 'SolveSpace pinned fetch failed' }
    git -C .research/solvespace-src checkout --detach 2879a02d2866e103d7a4817721ead9ac43558aea
    if ($LASTEXITCODE -ne 0) { throw 'SolveSpace checkout failed' }
}
if ((git -C .research/solvespace-src rev-parse HEAD) -ne '2879a02d2866e103d7a4817721ead9ac43558aea') { throw 'Unexpected SolveSpace commit' }
git -C .research/solvespace-src submodule update --init --depth 1 extlib/eigen extlib/mimalloc
if ($LASTEXITCODE -ne 0) { throw 'Pinned submodule initialization failed' }
foreach ($patch in @('solvespace-js-array.patch', 'solvespace-esm-build.patch', 'solvespace-gitdir.patch')) {
    git -C .research/solvespace-src apply --reverse --check (Join-Path $projectRoot "patches/$patch") 2>$null
    if ($LASTEXITCODE -ne 0) {
        git -C .research/solvespace-src apply (Join-Path $projectRoot "patches/$patch")
        if ($LASTEXITCODE -ne 0) { throw "Patch failed: $patch" }
    }
}
if (-not (Test-Path -LiteralPath .research/emsdk/.git)) {
    git clone --depth 1 --branch 4.0.8 https://github.com/emscripten-core/emsdk.git .research/emsdk
    if ($LASTEXITCODE -ne 0) { throw 'emsdk clone failed' }
}
if ((git -C .research/emsdk rev-parse HEAD) -ne '419021fa040428bc69ef1559b325addb8e10211f') { throw 'Unexpected emsdk commit' }
$sdkPython = Join-Path $projectRoot '.research/emsdk/python/3.9.2-nuget_64bit/python.exe'
if (Test-Path -LiteralPath $sdkPython) { $BootstrapPython = $sdkPython }
& $BootstrapPython .research/emsdk/emsdk.py install 4.0.8
if ($LASTEXITCODE -ne 0) { throw 'SDK install failed; provide Python 3.8+ using -BootstrapPython' }
& $BootstrapPython .research/emsdk/emsdk.py activate 4.0.8
if ($LASTEXITCODE -ne 0) { throw 'SDK activation failed' }
function Get-PinnedTool([string]$url, [string]$file, [string]$sha256) {
    if (-not (Test-Path -LiteralPath $file) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha256) {
        & curl.exe -fsSL --connect-timeout 15 --max-time 180 --retry 2 -o $file $url
        if ($LASTEXITCODE -ne 0) { throw "Tool download failed: $url" }
    }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha256) { throw "Tool hash mismatch: $file" }
}
Get-PinnedTool ("https://github.com/Kitware/CMake/releases/download/v3.31.8/cmake-3.31.8-windows-x86_64.zip?fresh=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())") '.research/tools/cmake-3.31.8-windows-x86_64.zip' '81aa9964dbabd71fe02e7ec50472fd3ad56138c49944515ece9001efbff8d719'
if (-not (Test-Path -LiteralPath .research/tools/cmake-3.31.8-windows-x86_64/bin/cmake.exe)) {
    Expand-Archive -LiteralPath .research/tools/cmake-3.31.8-windows-x86_64.zip -DestinationPath .research/tools -Force
}
Get-PinnedTool 'https://files.pythonhosted.org/packages/3f/dd/3766b5f4d32e8a9b97d195496b0b01fbbe2e1a41669dab0cd6492a6ce199/ninja-1.13.2-py3-none-win_amd64.whl' '.research/tools/ninja-1.13.2-py3-none-win_amd64.whl' '1293f4078278b70d0ee4b6cc8f3a9e030656c9b2f59909970343c4fe76070118'
& $sdkPython -c 'import pathlib,zipfile; target=pathlib.Path(".research/tools/ninja-1.13.2"); target.mkdir(exist_ok=True); z=zipfile.ZipFile(".research/tools/ninja-1.13.2-py3-none-win_amd64.whl"); (target/"ninja.exe").write_bytes(z.read("ninja-1.13.2.data/scripts/ninja.exe"))'
if ($LASTEXITCODE -ne 0) { throw 'Ninja extraction failed' }
Write-Output 'Pinned source and build tools ready. Run ./scripts/build-solver.ps1.'
