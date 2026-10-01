$projectRoot = Split-Path -Parent $PSScriptRoot
$sdkRoot = Join-Path $projectRoot '.research/emsdk'
$emsdkPython = Join-Path $sdkRoot 'python/3.9.2-nuget_64bit/python.exe'
$env:EMSDK = $sdkRoot
$env:EM_CONFIG = Join-Path $sdkRoot '.emscripten'
$env:EMSDK_PYTHON = $emsdkPython
$env:Path = "$(Join-Path $projectRoot '.research/tools/cmake-3.31.8-windows-x86_64/bin');$(Join-Path $projectRoot '.research/tools/ninja-1.13.2');$(Join-Path $sdkRoot 'upstream/emscripten');$(Join-Path $sdkRoot 'upstream/bin');$(Split-Path -Parent $emsdkPython);$env:Path"
