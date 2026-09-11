#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "错误：未找到 Node.js，请先安装 Node.js 20 或更高版本。" >&2
  exit 1
fi

NODE_MAJOR=$(node -p "Number(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "错误：需要 Node.js 20 或更高版本，当前版本为 $(node --version)。" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "错误：未找到 npm。" >&2
  exit 1
fi

echo "正在安装依赖…"
npm install
echo "正在构建 MCP…"
npm run build
node scripts/setup.mjs "$@"
