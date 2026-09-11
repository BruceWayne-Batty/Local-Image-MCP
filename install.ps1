$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "未找到 Node.js，请先安装 Node.js 20 或更高版本。"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "未找到 npm。"
}

$nodeMajor = [int](node -p "Number(process.versions.node.split('.')[0])")
if ($nodeMajor -lt 20) {
    throw "需要 Node.js 20 或更高版本，当前版本为 $(node --version)。"
}

Write-Host "正在安装依赖..."
npm install
Write-Host "正在构建 MCP..."
npm run build
node scripts/setup.mjs @args
