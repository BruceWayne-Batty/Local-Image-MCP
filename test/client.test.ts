import assert from "node:assert/strict";
import test from "node:test";
import { NewApiImageClient } from "../src/client.js";
import type { AppConfig } from "../src/types.js";

const config: AppConfig = {
  baseUrl: "https://api.example.com",
  apiKey: "secret",
  defaultProtocol: "openai",
  openAIModel: "gpt-image-1",
  geminiModel: "gemini-image",
  outputDir: "/tmp/images",
  timeoutMs: 5000,
};

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

test("OpenAI 协议发送请求并解析 base64 图片", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ data: [{ b64_json: png }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = new NewApiImageClient(config, fetcher);
  const result = await client.generate({ prompt: "一只猫", size: "1024x1024" });

  assert.equal(requestUrl, "https://api.example.com/v1/images/generations");
  assert.equal(result.images[0]?.mimeType, "image/png");
  assert.equal(result.protocol, "openai");
  const body = JSON.parse(String(requestInit?.body));
  assert.equal(body.prompt, "一只猫");
  assert.equal(body.size, "1024x1024");
  assert.equal(body.response_format, undefined);
  assert.equal(
    (requestInit?.headers as Record<string, string>).authorization,
    "Bearer secret",
  );
});

test("Gemini 协议解析 inlineData 图片和文本", async () => {
  const fetcher: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.generationConfig.imageConfig, {
      aspectRatio: "16:9",
      imageSize: "2K",
    });
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                { text: "生成完成" },
                { inlineData: { data: png, mimeType: "image/png" } },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const client = new NewApiImageClient(config, fetcher);
  const result = await client.generate({
    prompt: "山水画",
    protocol: "gemini",
    aspectRatio: "16:9",
    imageSize: "2K",
  });

  assert.equal(result.protocol, "gemini");
  assert.equal(result.text, "生成完成");
  assert.equal(result.images.length, 1);
});

test("API 错误包含状态码和响应信息", async () => {
  const fetcher: typeof fetch = async () =>
    new Response('{"error":"bad model"}', { status: 400 });
  const client = new NewApiImageClient(config, fetcher);
  await assert.rejects(
    () => client.generate({ prompt: "test" }),
    /NEW API 请求失败 \(400\).*bad model/,
  );
});
