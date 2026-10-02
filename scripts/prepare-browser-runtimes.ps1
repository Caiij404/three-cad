# Reproduce the isolated stable-browser matrix checked on 2026-10-03.
# Archives, executables and downloads stay in ignored .research; no installer runs.
$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeRoot = Join-Path $taskRoot '.research/browsers'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$archives = @(
  @{ name='chrome-154.zip'; version='154.0.8037.92'; url='https://storage.googleapis.com/chrome-for-testing-public/154.0.8037.92/win64/chrome-win64.zip'; sha256='B897EF3601C947AC0620C784556DEC719AC602B0159CE105927ACF645EE0F598'; destination='chrome-154' },
  @{ name='firefox-157.exe'; version='157.0'; url='https://download-installer.cdn.mozilla.net/pub/firefox/releases/157.0/win64/en-US/Firefox%20Setup%20157.0.exe'; sha256='58C90AFAB6E4B9A6B34D2958FE06D1A143DD9226EA8834377E5CD45E815936D7' },
  @{ name='edge-154.msi'; version='154.0.4258.53'; url='https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/ded68157-46e9-4336-a3b0-67ad31f3ea2c/MicrosoftEdgeEnterpriseX64.msi'; sha256='548E0700390FFD93545F40A8BAE1489FAEE3536F84CD7935BAB5A087F3758F36' },
  @{ name='7zr.exe'; version='portable extractor'; url='https://www.7-zip.org/a/7zr.exe'; sha256='AD4C82FADCBDF93C03B4FC440F300509C7D60C5C2F4D183E35D9D70D6957037D' },
  @{ name='geckodriver-0.37.1.zip'; version='0.37.1'; url='https://github.com/mozilla/geckodriver/releases/download/v0.37.1/geckodriver-v0.37.1-win64.zip'; sha256='DFED9315ABE8D2FBC1B6161A2EE8002452E79CF05EE92FDC653A4E26BC35EDD8'; destination='geckodriver-0.37.1' }
)
foreach ($archive in $archives) {
  $target = Join-Path $runtimeRoot $archive.name
  if (!(Test-Path -LiteralPath $target)) {
    if ($archive.name -eq 'geckodriver-0.37.1.zip') {
      # The official asset API also works when the release redirect is unavailable.
      $release = Invoke-RestMethod 'https://api.github.com/repos/mozilla/geckodriver/releases/tags/v0.37.1'
      $asset = $release.assets | Where-Object name -EQ 'geckodriver-v0.37.1-win64.zip'
      Invoke-WebRequest -Uri $asset.url -Headers @{Accept='application/octet-stream'} -OutFile $target -TimeoutSec 600
    } else {
      Invoke-WebRequest -Uri $archive.url -OutFile $target -TimeoutSec 600
    }
  }
  $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
  if ($hash -ne $archive.sha256) { throw "Unexpected SHA256 for $($archive.name): $hash" }
  if ($archive.destination) {
    $destination = Join-Path $runtimeRoot $archive.destination
    if (!(Test-Path -LiteralPath $destination)) { Expand-Archive -LiteralPath $target -DestinationPath $destination }
  }
}
$firefoxExe = Join-Path $runtimeRoot 'firefox-157/core/firefox.exe'
if (!(Test-Path -LiteralPath $firefoxExe)) {
  $extractorArgs = @('x', (Join-Path $runtimeRoot 'firefox-157.exe'), "-o$(Join-Path $runtimeRoot 'firefox-157')", '-y')
  & (Join-Path $runtimeRoot '7zr.exe') @extractorArgs | Out-Null
  if ($LASTEXITCODE -gt 1 -or !(Test-Path -LiteralPath $firefoxExe)) { throw 'Firefox extraction failed' }
}
$chromeExe = Join-Path $runtimeRoot 'chrome-154/chrome-win64/chrome.exe'
$edgeExe = Join-Path $runtimeRoot 'edge-154-browser/core/Chrome-bin/154.0.4258.53/msedge.exe'
if (!(Test-Path -LiteralPath $edgeExe)) {
  $edgeEmbedded = Join-Path $runtimeRoot 'edge-installer.exe'
  if (!(Test-Path -LiteralPath $edgeEmbedded)) { & (Join-Path $PSScriptRoot 'extract-msi-browser.ps1') -Archive (Join-Path $runtimeRoot 'edge-154.msi') -Output $edgeEmbedded }
  $decoderSource = Join-Path $runtimeRoot '7zip-source'
  if (!(Test-Path -LiteralPath $decoderSource)) {
    git clone --depth 1 --branch 26.03 --filter=blob:none --sparse https://github.com/ip7z/7zip $decoderSource
    if ($LASTEXITCODE -ne 0) { throw 'BCJ2 source download failed' }
    git -C $decoderSource sparse-checkout set --no-cone /C/Bcj2.c /C/Bcj2.h /C/7zTypes.h /C/CpuArch.h /C/Precomp.h /C/Compiler.h
    if ($LASTEXITCODE -ne 0) { throw 'BCJ2 sparse checkout failed' }
  }
  if ((git -C $decoderSource rev-parse HEAD) -ne '0766b733fe3e06dd2a7f9a3cfbf2108ac73abd17') { throw 'BCJ2 source commit mismatch' }
  $decoder = Join-Path $runtimeRoot 'bcj2-decoder.cjs'
  if (!(Test-Path -LiteralPath $decoder)) {
    . (Join-Path $PSScriptRoot 'use-wasm-tools.ps1')
    & emcc.bat (Join-Path $PSScriptRoot 'browser-bcj2-main.c') (Join-Path $decoderSource 'C/Bcj2.c') -I (Join-Path $decoderSource 'C') -O2 -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=2147483648 -sINITIAL_MEMORY=536870912 -sNODERAWFS=1 -sENVIRONMENT=node -o $decoder
    if ($LASTEXITCODE -ne 0) { throw 'BCJ2 test-tool compilation failed; use the documented M0 Emscripten toolchain' }
  }
  . (Join-Path $PSScriptRoot 'use-node.ps1')
  & node (Join-Path $PSScriptRoot 'extract-edge-archive.mjs')
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $edgeExe)) { throw 'Edge extraction failed' }
}
$chromeStable = Invoke-RestMethod 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json'
$firefoxStable = Invoke-RestMethod 'https://product-details.mozilla.org/1.0/firefox_versions.json'
$edgeCatalog = Invoke-RestMethod 'https://edgeupdates.microsoft.com/api/products?view=enterprise'
$edgeStable = ($edgeCatalog | Where-Object Product -EQ 'Stable').Releases | Where-Object { $_.Platform -EQ 'Windows' -and $_.Architecture -EQ 'x64' } | Select-Object -First 1
$record = @{
  task='T-403A'; checkedAt=(Get-Date).ToUniversalTime().ToString('o'); archives=$archives
  actual=@{chrome=(Get-Item -LiteralPath $chromeExe).VersionInfo.ProductVersion; firefox=(Get-Item -LiteralPath $firefoxExe).VersionInfo.ProductVersion; edge=(Get-Item -LiteralPath $edgeExe).VersionInfo.ProductVersion}
  officialStable=@{chrome=$chromeStable.channels.Stable.version; chromeTimestamp=$chromeStable.timestamp; firefox=$firefoxStable.LATEST_FIREFOX_VERSION; firefoxRelease=$firefoxStable.LAST_RELEASE_DATE; edge=$edgeStable.ProductVersion; edgePublished=$edgeStable.PublishedTime}
  decoder=@{sourceCommit='0766b733fe3e06dd2a7f9a3cfbf2108ac73abd17';source='https://github.com/ip7z/7zip';paths=@('C/Bcj2.c','C/Bcj2.h','C/7zTypes.h','C/CpuArch.h','C/Precomp.h','C/Compiler.h');license='Public domain original headers retained';compiler='Emscripten4.0.8';changes='None; local wrapper only';use='Ignored test tool only'}
  machine=@{cpu=(Get-CimInstance Win32_Processor | Select-Object Name,NumberOfLogicalProcessors); ramBytes=(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory; gpu=(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion)}
  runtimeUse='Testing only; ignored project directory; no system installation or app-bundle dependency'
}
$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $taskRoot 'docs/learning/evidence/T-403A-browser-runtimes.json') -Encoding utf8
Write-Output ($record.actual | ConvertTo-Json -Compress)
if ($record.actual.chrome -ne $record.officialStable.chrome -or $record.actual.firefox -ne $record.officialStable.firefox -or $record.actual.edge -ne $record.officialStable.edge) {
  Write-Warning 'This historical matrix is no longer current stable. Record and validate an updated matrix before claiming current-stable acceptance.'
}
