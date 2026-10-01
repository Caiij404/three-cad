$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
. ./scripts/use-wasm-tools.ps1
$sourceDirectory = Join-Path $projectRoot '.research/solvespace-src'
$buildDirectory = Join-Path $projectRoot '.research/solvespace-build'
$evidenceDirectory = Join-Path $projectRoot 'docs/learning/evidence'
if ((git -C $sourceDirectory rev-parse HEAD) -ne '2879a02d2866e103d7a4817721ead9ac43558aea') { throw 'Unexpected SolveSpace commit' }
foreach ($patch in @('solvespace-js-array.patch', 'solvespace-esm-build.patch', 'solvespace-gitdir.patch')) {
    git -C $sourceDirectory apply --reverse --check (Join-Path $projectRoot "patches/$patch")
    if ($LASTEXITCODE -ne 0) { throw "Required patch is not applied: $patch" }
}
& emcc.bat --version
if ($LASTEXITCODE -ne 0) { throw 'Emscripten is unavailable' }
& emcmake.bat cmake -S $sourceDirectory -B $buildDirectory -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_FLAGS=-DEIGEN_MPL2_ONLY -DENABLE_GUI=OFF -DENABLE_CLI=OFF -DENABLE_TESTS=OFF -DENABLE_PYTHON_LIB=OFF -DENABLE_OPENMP=OFF -DFORCE_VENDORED_Eigen3=ON -DENABLE_LTO=ON 2>&1 | Tee-Object -FilePath (Join-Path $evidenceDirectory 'T-003-configure.log')
if ($LASTEXITCODE -ne 0) { throw 'SolveSpace configure failed; see evidence log' }
& cmake --build $buildDirectory --target slvs-wasm --parallel 2 2>&1 | Tee-Object -FilePath (Join-Path $evidenceDirectory 'T-003-build.log')
if ($LASTEXITCODE -ne 0) { throw 'SolveSpace build failed; see evidence log' }
$artifactDirectory = Join-Path $projectRoot 'public/wasm'
New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $buildDirectory 'bin/slvs.mjs') -Destination $artifactDirectory
Copy-Item -LiteralPath (Join-Path $buildDirectory 'bin/slvs.wasm') -Destination $artifactDirectory
Write-Output 'Built and copied real solver to public/wasm; now run numerical fixtures.'
