#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer(config);
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error("NEW API Image MCP 启动失败：", error);
  process.exit(1);
});
