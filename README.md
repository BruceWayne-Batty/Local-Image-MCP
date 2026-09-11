# NEW API Image MCP

本地 MCP Server，通过 NEW API 使用 OpenAI/GPT 或 Gemini 协议生成图片。图片会保存到本机，并作为 MCP 图片内容返回给客户端。

- **OpenAI / GPT 协议**：`POST /v1/images/generations`
- **Gemini 原生协议**：`POST /v1beta/models/{model}:generateContent`

## 环境要求

- Node.js 20 或更高版本

## 一键安装与配置

### macOS / Linux

```bash
cd "/Users/bruce/Local Image MCP"
./install.sh
```

### Windows PowerShell

```powershell
cd "项目所在目录"
PowerShell -ExecutionPolicy Bypass -File .\install.ps1
```

安装程序会自动：

1. 安装 npm 依赖；
2. 构建 TypeScript MCP；
3. 提示输入 NEW API 地址和 Key（终端中隐藏 Key）；
4. 配置默认协议、模型和图片目录；
5. 测试 NEW API 连接及模型是否存在；
6. 输出可直接复制到客户端的 MCP 配置。

如依赖已经安装，也可以只运行配置向导：

```bash
npm run setup
```

以后修改地址、Key 或默认模型时，再运行一次 `npm run setup` 即可。已有 Key 可以按回车保留，不会显示在终端中。

## 配置文件位置

配置默认保存在当前系统用户目录，不放在项目和 Git 仓库里：

| 系统 | 默认路径 |
|---|---|
| macOS / Linux | `~/.config/new-api-image-mcp/config.json` |
| Windows | `%APPDATA%\new-api-image-mcp\config.json` |

macOS/Linux 下，安装程序会把目录权限设为 `700`、文件权限设为 `600`。配置文件仍然包含明文 API Key，因此不要上传、公开分享或提交到 Git。

配置格式如下：

```json
{
  "baseUrl": "https://api.example.com/v1",
  "apiKey": "sk-请填写自己的Key",
  "defaultProtocol": "openai",
  "openAIModel": "gpt-image-1.5",
  "geminiModel": "gemini-3.1-flash-image",
  "outputDir": "/Users/your-name/Pictures/new-api-image-mcp",
  "timeoutMs": 120000
}
```

通常不需要手动编辑，推荐使用安装向导。

## 客户端 MCP 配置

配置文件创建后，客户端中只需提供启动命令，不再需要重复填写地址和 Key：

```json
{
  "mcpServers": {
    "new-api-image": {
      "command": "node",
      "args": [
        "/Users/bruce/Local Image MCP/dist/src/index.js"
      ]
    }
  }
}
```

`install.sh`/`install.ps1` 最后会按照当前设备的真实 Node.js 和项目路径生成这段 JSON，优先使用脚本输出的内容。

客户端启动 MCP 后，MCP 会自动读取当前用户的配置文件：

```text
MCP 客户端 → 启动本地 MCP → 读取用户配置 → 调用 NEW API
```

这里没有 HTTP 回调地址，也不需要开放本地端口；客户端和 MCP 之间使用 `stdio` 通信。

## 多客户端和多设备使用

### 同一设备上的不同客户端

只需要运行一次安装向导。AionUi、Claude Desktop、Cursor、Cherry Studio 等客户端可以共享同一个用户配置文件；分别复制安装程序输出的 MCP 启动配置即可。

### 不同设备

在每台设备上复制/克隆项目并运行对应安装脚本。推荐在每台设备上重新输入 Key，避免通过聊天、网盘或 Git 传输密钥。

也可以通过安全的密码管理器传输 `config.json`，然后放到目标系统的默认配置路径。需要注意：

- 项目安装路径可能不同，客户端的 `args` 路径需要使用该设备上的路径；
- 图片输出目录也可能需要修改；
- 不要把 `config.json` 放入项目仓库；
- 最好给不同设备创建不同的限额 Key，方便单独撤销。

## 配置优先级和临时覆盖

运行时按以下优先级读取配置：

1. 环境变量；
2. 用户级 `config.json`；
3. 程序默认值（仅模型、协议、超时等非敏感字段）。

因此旧的环境变量配置仍然兼容，也可以临时覆盖配置文件：

| 环境变量 | 对应配置 |
|---|---|
| `NEW_API_BASE_URL` | `baseUrl` |
| `NEW_API_KEY` | `apiKey` |
| `IMAGE_PROTOCOL` | `defaultProtocol` |
| `OPENAI_IMAGE_MODEL` | `openAIModel` |
| `GEMINI_IMAGE_MODEL` | `geminiModel` |
| `IMAGE_OUTPUT_DIR` | `outputDir` |
| `IMAGE_REQUEST_TIMEOUT_MS` | `timeoutMs` |
| `IMAGE_MCP_CONFIG` | 使用另一个配置文件路径 |

## MCP 工具

### `generate_image`

| 参数 | 适用协议 | 说明 |
|---|---|---|
| `prompt` | 全部 | 必填，图片提示词 |
| `protocol` | 全部 | `openai` 或 `gemini`；不填使用默认协议 |
| `model` | 全部 | 覆盖本次请求使用的模型 |
| `size` | OpenAI/GPT | 如 `1024x1024`、`1536x1024`、`auto` |
| `quality` | OpenAI/GPT | 如 `low`、`medium`、`high`、`auto` |
| `style` | OpenAI/GPT | 如 `vivid`、`natural`，由模型决定是否支持 |
| `aspectRatio` | Gemini | 如 `1:1`、`16:9`、`9:16` |
| `imageSize` | Gemini | 如 `1K`、`2K`、`4K`，由模型决定是否支持 |
| `count` | 全部 | 生成数量，范围 1–4；部分模型只允许 1 |
| `negativePrompt` | 全部 | 不希望出现的内容，会追加到提示词中 |
| `seed` | Gemini | 随机种子，由模型和网关决定是否支持 |
| `fileName` | 全部 | 本地保存文件名，不需要扩展名 |

OpenAI/GPT 示例：

```json
{
  "prompt": "一只戴宇航员头盔的橘猫，电影级光影，细节丰富",
  "protocol": "openai",
  "model": "gpt-image-1.5",
  "size": "1024x1024",
  "quality": "high",
  "fileName": "astronaut-cat"
}
```

Gemini 示例：

```json
{
  "prompt": "中国水墨画风格的未来城市，云雾缭绕",
  "protocol": "gemini",
  "model": "gemini-3.1-flash-image",
  "aspectRatio": "16:9",
  "imageSize": "2K",
  "fileName": "future-city"
}
```

## 开发与测试

```bash
npm run check
```

该命令会执行 TypeScript 编译和测试。本地自动化测试使用 Mock 响应，不消耗真实 API 额度。

## 常见问题

### 返回“响应中没有图片数据”

通常表示模型不支持图片输出、NEW API 渠道未正确映射，或模型名不对。请确认渠道支持对应模型和协议，且账户余额充足。

### 返回 404

NEW API 地址推荐填写站点根地址（如 `https://api.example.com`）或带版本的地址（如 `https://api.example.com/v1`），服务会自动拼接协议路径。

### 客户端启动时提示缺少配置

在项目目录运行：

```bash
npm run setup
```

并确认运行 MCP 的客户端与安装配置时使用的是同一个系统账户。

### Gemini 请求如何鉴权？

MCP 会同时携带 `Authorization: Bearer <key>` 和 `x-goog-api-key: <key>`，兼容 NEW API Bearer 鉴权以及 Gemini 风格鉴权。
