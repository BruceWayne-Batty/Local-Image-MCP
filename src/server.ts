import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NewApiImageClient } from "./client.js";
import { saveImages } from "./output.js";
import type { AppConfig } from "./types.js";

const generateSchema = {
  prompt: z.string().min(1).describe("图片生成提示词"),
  protocol: z
    .enum(["openai", "gemini"])
    .optional()
    .describe("接口协议；不填则使用服务端默认值"),
  model: z.string().min(1).optional().describe("模型名；不填则使用对应协议的默认模型"),
  size: z
    .string()
    .optional()
    .describe("OpenAI 图片尺寸，例如 1024x1024、1536x1024 或 auto"),
  aspectRatio: z
    .string()
    .optional()
    .describe("Gemini 宽高比，例如 1:1、16:9、9:16"),
  imageSize: z
    .string()
    .optional()
    .describe("Gemini 输出清晰度，例如 1K、2K、4K（需模型支持）"),
  count: z.number().int().min(1).max(4).optional().describe("生成数量，默认 1"),
  quality: z.string().optional().describe("OpenAI 质量，例如 low、medium、high 或 auto"),
  style: z.string().optional().describe("OpenAI 风格，例如 vivid 或 natural"),
  negativePrompt: z.string().optional().describe("不希望图片出现的内容"),
  seed: z.number().int().optional().describe("Gemini 随机种子（需网关和模型支持）"),
  fileName: z.string().optional().describe("保存文件名，不需要扩展名"),
};

export function createServer(config: AppConfig): McpServer {
  const server = new McpServer({
    name: "new-api-image-mcp",
    version: "1.0.0",
  });
  const client = new NewApiImageClient(config);

  server.registerTool(
    "generate_image",
    {
      title: "通过 NEW API 生成图片",
      description:
        "使用 OpenAI/GPT 或 Gemini 原生协议生成图片。图片会保存到本地，并作为 MCP 图片内容返回。",
      inputSchema: generateSchema,
    },
    async (input) => {
      try {
        const result = await client.generate(input);
        const paths = await saveImages(config.outputDir, result.images, input.fileName);
        const summary = [
          `已通过 ${result.protocol} 协议和 ${result.model} 模型生成 ${result.images.length} 张图片。`,
          ...paths.map((filePath) => `已保存：${filePath}`),
          result.text ? `模型说明：${result.text}` : undefined,
        ]
          .filter(Boolean)
          .join("\n");

        return {
          content: [
            { type: "text" as const, text: summary },
            ...result.images.map((image) => ({
              type: "image" as const,
              data: image.data,
              mimeType: image.mimeType,
            })),
          ],
          structuredContent: {
            protocol: result.protocol,
            model: result.model,
            files: paths,
            count: result.images.length,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text" as const, text: `图片生成失败：${message}` }],
        };
      }
    },
  );

  return server;
}
