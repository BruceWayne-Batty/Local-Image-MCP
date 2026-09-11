import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getConfigPath, loadConfig } from "../src/config.js";

const envNames = [
  "IMAGE_MCP_CONFIG",
  "NEW_API_BASE_URL",
  "NEW_API_KEY",
  "IMAGE_PROTOCOL",
  "OPENAI_IMAGE_MODEL",
  "GEMINI_IMAGE_MODEL",
  "IMAGE_OUTPUT_DIR",
  "IMAGE_REQUEST_TIMEOUT_MS",
] as const;

test("从用户配置文件加载并允许环境变量覆盖", { concurrency: false }, async () => {
  const oldEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const dir = await mkdtemp(path.join(os.tmpdir(), "image-mcp-config-"));
  const configPath = path.join(dir, "config.json");
  await writeFile(
    configPath,
    JSON.stringify({
      baseUrl: "https://stored.example.com/v1/",
      apiKey: "stored-key",
      defaultProtocol: "gemini",
      openAIModel: "stored-openai",
      geminiModel: "stored-gemini",
      outputDir: path.join(dir, "images"),
      timeoutMs: 90000,
    }),
  );

  try {
    for (const name of envNames) delete process.env[name];
    process.env.IMAGE_MCP_CONFIG = configPath;
    process.env.NEW_API_KEY = "env-key";

    assert.equal(getConfigPath(), configPath);
    const config = loadConfig();
    assert.equal(config.baseUrl, "https://stored.example.com/v1");
    assert.equal(config.apiKey, "env-key");
    assert.equal(config.defaultProtocol, "gemini");
    assert.equal(config.openAIModel, "stored-openai");
    assert.equal(config.timeoutMs, 90000);
  } finally {
    for (const name of envNames) {
      const oldValue = oldEnv[name];
      if (oldValue === undefined) delete process.env[name];
      else process.env[name] = oldValue;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test("缺少地址和 Key 时提示运行配置向导", { concurrency: false }, async () => {
  const oldEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  const dir = await mkdtemp(path.join(os.tmpdir(), "image-mcp-empty-"));
  try {
    for (const name of envNames) delete process.env[name];
    process.env.IMAGE_MCP_CONFIG = path.join(dir, "missing.json");
    assert.throws(() => loadConfig(), /请运行 npm run setup/);
  } finally {
    for (const name of envNames) {
      const oldValue = oldEnv[name];
      if (oldValue === undefined) delete process.env[name];
      else process.env[name] = oldValue;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
