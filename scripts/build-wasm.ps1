param(
	[string]$BuildDir = "build-wasm",
	[string]$Generator = "Ninja"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Import-Emsdk {
	if (Get-Command emcmake -ErrorAction SilentlyContinue) { return }
	$candidates = @(
		(Join-Path $env:USERPROFILE "emsdk\emsdk_env.ps1"),
		"C:\emsdk\emsdk_env.ps1",
		"$env:EMSDK\emsdk_env.ps1"
	)
	foreach ($envScript in $candidates) {
		if ($envScript -and (Test-Path $envScript)) {
			Write-Host "Chargement Emscripten: $envScript"
			. $envScript
			return
		}
	}
	Write-Error "emcmake introuvable. Installez Emscripten (https://emscripten.org) puis relancez ce script."
}

function Ensure-Vendor($rel, $url) {
	$path = Join-Path $Root $rel
	$hasFiles = (Test-Path $path) -and (@(Get-ChildItem $path -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne ".git" }).Count -gt 0)
	if ($hasFiles) { return }
	Write-Host "Clonage de $rel ..."
	if (Test-Path $path) { Remove-Item $path -Recurse -Force }
	git clone --depth 1 $url $path
	if ($LASTEXITCODE -ne 0) { throw "Echec du clone $url" }
}

Import-Emsdk

$protocDir = Join-Path $Root "tools\protoc\bin"
if (Test-Path (Join-Path $protocDir "protoc.exe")) {
	$env:PATH = "$protocDir;$env:PATH"
}

if (-not (Get-Command protoc -ErrorAction SilentlyContinue)) {
	Write-Error "protoc introuvable. Placez un binaire dans tools\protoc\bin ou installez Protocol Buffers."
}

Ensure-Vendor "third-party\nanopb" "https://github.com/nanopb/nanopb.git"
Ensure-Vendor "third-party\jerasure" "https://github.com/streetpea/jerasure.git"
Ensure-Vendor "third-party\gf-complete" "https://github.com/streetpea/gf-complete.git"

Write-Host "emcc: $((Get-Command emcc).Source)"
Write-Host "protoc: $((Get-Command protoc).Source)"
Write-Host "Configuration Emscripten dans $BuildDir ..."
emcmake cmake -S $Root -B (Join-Path $Root $BuildDir) -G $Generator -DCHIAKI_ENABLE_WASM=ON
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Compilation chiaki-wasm ..."
cmake --build (Join-Path $Root $BuildDir) --target chiaki-wasm
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$Out = Join-Path $Root "$BuildDir\wasm"
Write-Host "OK. Lancer:  node `"$Out\server.mjs`""
Write-Host "Puis ouvrir http://127.0.0.1:8080/"
