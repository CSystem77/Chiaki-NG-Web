#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${1:-build-wasm}"
cd "$ROOT"

if ! command -v emcmake >/dev/null; then
	echo "emcmake introuvable. Installez Emscripten (emsdk)." >&2
	exit 1
fi

emcmake cmake -S "$ROOT" -B "$ROOT/$BUILD_DIR" -G Ninja -DCHIAKI_ENABLE_WASM=ON
cmake --build "$ROOT/$BUILD_DIR" --target chiaki-wasm
echo "OK. Lancer: node $ROOT/$BUILD_DIR/wasm/server.mjs"
echo "Puis ouvrir http://127.0.0.1:8080/"
