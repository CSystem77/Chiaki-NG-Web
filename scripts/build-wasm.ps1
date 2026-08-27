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

function Ensure-Protoc {
	$protocDir = Join-Path $Root "tools\protoc\bin"
	$protocExe = Join-Path $protocDir "protoc.exe"
	if (Test-Path $protocExe) {
		$env:PATH = "$protocDir;$env:PATH"
	}
	if (Get-Command protoc -ErrorAction SilentlyContinue) { return }

	$ver = "3.9.1"
	$url = "https://github.com/protocolbuffers/protobuf/releases/download/v$ver/protoc-$ver-win64.zip"
	$dest = Join-Path $Root "tools\protoc"
	$zip = Join-Path $env:TEMP "protoc-$ver-win64.zip"
	Write-Host "Telechargement de protoc $ver vers tools\protoc ..."
	[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
	New-Item -ItemType Directory -Force -Path $dest | Out-Null
	Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
	Expand-Archive -Path $zip -DestinationPath $dest -Force
	Remove-Item $zip -ErrorAction SilentlyContinue
	if (-not (Test-Path $protocExe)) {
		Write-Error "Echec du telechargement de protoc. Installez Protocol Buffers ou placez protoc.exe dans tools\protoc\bin."
	}
	$env:PATH = "$protocDir;$env:PATH"
}

function Ensure-WasmPython {
	$venv = Join-Path $Root "tools\wasm-python"
	$py = Join-Path $venv "Scripts\python.exe"
	if (-not (Test-Path $py)) {
		Write-Host "Creation de tools\wasm-python (protobuf 4.25.3, compatible nanopb) ..."
		$base = Get-Command python -ErrorAction SilentlyContinue
		if (-not $base) { Write-Error "Python 3 introuvable (requis pour nanopb)." }
		& $base.Source -m venv $venv
		if ($LASTEXITCODE -ne 0) { throw "Echec de python -m venv" }
	}
	$ok = $false
	try {
		$ver = & $py -c "from google.protobuf.descriptor_pb2 import FileOptions; print(hasattr(FileOptions,'RegisterExtension'))"
		if ($ver -eq "True") { $ok = $true }
	} catch {}
	if (-not $ok) {
		Write-Host "Installation de protobuf 4.25.3 dans tools\wasm-python ..."
		& $py -m pip install --quiet --disable-pip-version-check "protobuf==4.25.3"
		if ($LASTEXITCODE -ne 0) { throw "Echec pip install protobuf==4.25.3" }
	}
	return $py
}

Import-Emsdk
Ensure-Protoc
$WasmPython = Ensure-WasmPython

Ensure-Vendor "third-party\nanopb" "https://github.com/nanopb/nanopb.git"
Ensure-Vendor "third-party\jerasure" "https://github.com/streetpea/jerasure.git"
Ensure-Vendor "third-party\gf-complete" "https://github.com/streetpea/gf-complete.git"

Write-Host "emcc: $((Get-Command emcc).Source)"
Write-Host "protoc: $((Get-Command protoc).Source)"
Write-Host "python (nanopb): $WasmPython"
Write-Host "Configuration Emscripten dans $BuildDir ..."
emcmake cmake -S $Root -B (Join-Path $Root $BuildDir) -G $Generator -DCHIAKI_ENABLE_WASM=ON -DPYTHON_EXECUTABLE="$WasmPython"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Compilation chiaki-wasm ..."
cmake --build (Join-Path $Root $BuildDir) --target chiaki-wasm
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$Out = Join-Path $Root "$BuildDir\wasm"
Write-Host "OK. Lancer:  node `"$Out\server.mjs`""
Write-Host "Puis ouvrir http://127.0.0.1:8080/"
