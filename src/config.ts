import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppConfig, ImageProtocol } from "./types.js";

interface StoredConfig {
  baseUrl?: string;
  apiKey?: string;
  defaultProtocol?: string;
  openAIModel?: string;
  geminiModel?: string;
  outputDir?: string;
  timeoutMs?: number;
}

export function getDefaultConfigPath(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "new-api-image-mcp", "config.json");
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, "new-api-image-mcp", "config.json");
}

export function getConfigPath(): string {
  return path.resolve(process.env.IMAGE_MCP_CONFIG || getDefaultConfigPath());
}

function readStoredConfig(configPath: string): StoredConfig {
  if (!existsSync(configPath)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("顶层必须是 JSON 对象");
    }
    return parsed as StoredConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取配置文件 ${configPath}：${message}`);
  }
}

function value(envName: string, stored: unknown): string | undefined {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  return typeof stored === "string" && stored.trim() ? stored.trim() : undefined;
}

function required(envName: string, stored: unknown, configPath: string): string {
  const result = value(envName, stored);
  if (!result) {
    throw new Error(
      `缺少 ${envName}。请运行 npm run setup，或在 ${configPath} 中配置`,
    );
  }
  return result;
}

function parseProtocol(value: string | undefined): ImageProtocol {
  if (!value || value === "openai") return "openai";
  if (value === "gemini") return "gemini";
  throw new Error("默认协议必须是 openai 或 gemini");
}

export function loadConfig(): AppConfig {
  const configPath = getConfigPath();
  const stored = readStoredConfig(configPath);
  const timeoutValue = value("IMAGE_REQUEST_TIMEOUT_MS", stored.timeoutMs?.toString());
  const timeoutMs = Number(timeoutValue ?? "120000");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("请求超时必须是正数");
  }

  return {
    baseUrl: required("NEW_API_BASE_URL", stored.baseUrl, configPath).replace(/\/+$/, ""),
    apiKey: required("NEW_API_KEY", stored.apiKey, configPath),
    defaultProtocol: parseProtocol(
      value("IMAGE_PROTOCOL", stored.defaultProtocol),
    ),
    openAIModel:
      value("OPENAI_IMAGE_MODEL", stored.openAIModel) || "gpt-image-2.5-sunburst",
    geminiModel:
      value("GEMINI_IMAGE_MODEL", stored.geminiModel) ||
      "gemini-3.1-flash-image",
    outputDir: path.resolve(
      value("IMAGE_OUTPUT_DIR", stored.outputDir) || "output",
    ),
    timeoutMs,
  };
}
