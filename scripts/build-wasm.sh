#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${1:-build-wasm}"
cd "$ROOT"

if ! command -v emcmake >/dev/null; then
	echo "emcmake introuvable. Installez Emscripten (emsdk)." >&2
	exit 1
fi

PROTOC_DIR="$ROOT/tools/protoc/bin"
if [ -x "$PROTOC_DIR/protoc" ]; then
	export PATH="$PROTOC_DIR:$PATH"
fi
if ! command -v protoc >/dev/null; then
	VER="3.9.1"
	if [ "$(uname -m)" = "aarch64" ]; then ARCH="aarch_64"; else ARCH="x86_64"; fi
	URL="https://github.com/protocolbuffers/protobuf/releases/download/v${VER}/protoc-${VER}-linux-${ARCH}.zip"
	DEST="$ROOT/tools/protoc"
	ZIP="$(mktemp).zip"
	echo "Telechargement de protoc ${VER} vers tools/protoc ..."
	mkdir -p "$DEST"
	curl -L "$URL" -o "$ZIP"
	unzip -o "$ZIP" -d "$DEST"
	rm -f "$ZIP"
	chmod +x "$DEST/bin/protoc"
	export PATH="$DEST/bin:$PATH"
fi
if ! command -v protoc >/dev/null; then
	echo "protoc introuvable. Installez protobuf-compiler ou placez un binaire dans tools/protoc/bin." >&2
	exit 1
fi

VENV="$ROOT/tools/wasm-python"
if [ -x "$VENV/bin/python" ]; then
	WASM_PYTHON="$VENV/bin/python"
else
	echo "Creation de tools/wasm-python (protobuf 4.25.3, compatible nanopb) ..."
	python3 -m venv "$VENV"
	WASM_PYTHON="$VENV/bin/python"
fi
if ! "$WASM_PYTHON" -c "from google.protobuf.descriptor_pb2 import FileOptions; assert hasattr(FileOptions,'RegisterExtension')" 2>/dev/null; then
	echo "Installation de protobuf 4.25.3 dans tools/wasm-python ..."
	"$WASM_PYTHON" -m pip install --quiet --disable-pip-version-check "protobuf==4.25.3"
fi

emcmake cmake -S "$ROOT" -B "$ROOT/$BUILD_DIR" -G Ninja -DCHIAKI_ENABLE_WASM=ON -DPYTHON_EXECUTABLE="$WASM_PYTHON"
cmake --build "$ROOT/$BUILD_DIR" --target chiaki-wasm
echo "OK. Lancer: node $ROOT/$BUILD_DIR/wasm/server.mjs"
echo "Puis ouvrir http://127.0.0.1:8080/"
