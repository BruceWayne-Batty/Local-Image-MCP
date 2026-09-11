#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const customPath = argumentValue("--config");
const configPath = path.resolve(customPath || defaultConfigPath());
const current = await readExisting(configPath);

class MuteableOutput extends Writable {
  muted = false;
  _write(chunk, _encoding, callback) {
    if (!this.muted) process.stdout.write(chunk);
    callback();
  }
}

const terminalOutput = new MuteableOutput();
const rl = createInterface({
  input: process.stdin,
  output: terminalOutput,
  terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
});

console.log("\nNEW API Image MCP 配置向导");
console.log(`配置将保存到：${configPath}\n`);

try {
  const baseUrl = await askUrl(current.baseUrl || "");
  const apiKey = await askKey(current.apiKey);
  const defaultProtocol = await askChoice(
    "默认协议",
    ["openai", "gemini"],
    current.defaultProtocol || "openai",
  );
  const openAIModel = await ask(
    "OpenAI/GPT 默认模型",
    current.openAIModel || "gpt-image-1.5",
  );
  const geminiModel = await ask(
    "Gemini 默认模型",
    current.geminiModel || "gemini-3.1-flash-image",
  );
  const outputDir = path.resolve(
    expandHome(
      await ask(
        "图片保存目录",
        current.outputDir || path.join(os.homedir(), "Pictures", "new-api-image-mcp"),
      ),
    ),
  );
  const timeoutText = await ask(
    "请求超时（毫秒）",
    String(current.timeoutMs || 120000),
  );
  const timeoutMs = Number(timeoutText);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("请求超时必须是正数");
  }

  const config = {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    defaultProtocol,
    openAIModel,
    geminiModel,
    outputDir,
    timeoutMs,
  };

  await writeSecureJson(configPath, config);
  console.log(`\n✓ 配置已保存：${configPath}`);

  const shouldTest = await askChoice("是否测试 NEW API 连接", ["y", "n"], "y");
  if (shouldTest === "y") await testConnection(config);

  const entry = path.join(projectRoot, "dist", "src", "index.js");
  console.log("\n客户端 MCP 配置（不再需要 env）：\n");
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          "new-api-image": {
            command: process.execPath,
            args: [entry],
          },
        },
      },
      null,
      2,
    ),
  );
  if (!existsSync(entry)) {
    console.log("\n注意：入口文件尚未构建，请先执行 npm run build。");
  }
  console.log("\n以后可再次运行 npm run setup 修改配置。\n");
} finally {
  rl.close();
}

async function ask(label, fallback = "") {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  return answer || fallback;
}

async function askUrl(fallback) {
  while (true) {
    const answer = await ask("NEW API 地址", fallback);
    try {
      const url = new URL(answer);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
      return answer;
    } catch {
      console.log("请输入有效的 http:// 或 https:// 地址。");
    }
  }
}

async function askKey(existing) {
  while (true) {
    const hint = existing ? "（直接回车保留现有 Key）" : "";
    process.stdout.write(`NEW API Key ${hint}: `);
    terminalOutput.muted = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    const answer = (await rl.question("")).trim();
    terminalOutput.muted = false;
    if (process.stdin.isTTY && process.stdout.isTTY) process.stdout.write("\n");
    if (answer) return answer;
    if (existing) return existing;
    console.log("API Key 不能为空。");
  }
}

async function askChoice(label, choices, fallback) {
  while (true) {
    const answer = (await ask(`${label} (${choices.join("/")})`, fallback)).toLowerCase();
    if (choices.includes(answer)) return answer;
    console.log(`请输入 ${choices.join(" 或 ")}。`);
  }
}

async function readExisting(filePath) {
  if (!existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    throw new Error(`无法读取现有配置 ${filePath}：${error.message}`);
  }
}

async function writeSecureJson(filePath, data) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(directory, 0o700);
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, filePath);
  if (process.platform !== "win32") await chmod(filePath, 0o600);
}

async function testConnection(config) {
  process.stdout.write("正在测试连接… ");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const root = config.baseUrl.replace(/\/+$/, "");
    const url = /\/v1$/i.test(root) ? `${root}/models` : `${root}/v1/models`;
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }
    const body = await response.json();
    const ids = Array.isArray(body.data) ? body.data.map((item) => item?.id) : [];
    const selected = [config.openAIModel, config.geminiModel];
    const unavailable = selected.filter((model) => !ids.includes(model));
    console.log(`✓ 成功（发现 ${ids.length} 个模型）`);
    if (unavailable.length) {
      console.log(`  提醒：模型列表中未发现 ${unavailable.join("、")}`);
    }
  } catch (error) {
    console.log(`✗ 失败：${error.name === "AbortError" ? "连接超时" : error.message}`);
    console.log("  配置已经保存，可稍后再次运行 npm run setup 修改。");
  } finally {
    clearTimeout(timer);
  }
}

function defaultConfigPath() {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      "new-api-image-mcp",
      "config.json",
    );
  }
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    "new-api-image-mcp",
    "config.json",
  );
}

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith(`~${path.sep}`)) return path.join(os.homedir(), value.slice(2));
  return value;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const result = process.argv[index + 1];
  if (!result) throw new Error(`${name} 后必须提供路径`);
  return result;
}
