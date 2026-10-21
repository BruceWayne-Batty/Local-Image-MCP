import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

test("OpenAI 图片编辑使用 multipart 请求并传入源图片", async () => {
  let requestUrl = "";
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    assert.ok(init?.body instanceof FormData);
    const form = init.body;
    assert.equal(form.get("model"), "gpt-image-1");
    assert.equal(form.get("prompt"), "把猫的毛色改成橘色");
    assert.equal(form.get("n"), "1");
    assert.equal(form.get("size"), "1024x1024");
    const image = form.get("image");
    assert.ok(image instanceof Blob);
    assert.equal(image.type, "image/png");
    assert.equal(
      Buffer.from(await image.arrayBuffer()).toString("base64"),
      png,
    );
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer secret");
    return new Response(JSON.stringify({ data: [{ b64_json: png }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = new NewApiImageClient(config, fetcher);
  const result = await client.edit({
    image: `data:image/png;base64,${png}`,
    prompt: "把猫的毛色改成橘色",
    size: "1024x1024",
  });

  assert.equal(requestUrl, "https://api.example.com/v1/images/edits");
  assert.equal(result.protocol, "openai");
  assert.equal(result.images.length, 1);
});

test("Gemini 图片编辑传入 inlineData 源图片", async () => {
  const fetcher: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.contents[0].parts, [
      { text: "把天空改成日落" },
      { inlineData: { data: png, mimeType: "image/png" } },
    ]);
    assert.deepEqual(body.generationConfig.imageConfig, { aspectRatio: "16:9" });
    return new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ inlineData: { data: png, mimeType: "image/png" } }] } },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const client = new NewApiImageClient(config, fetcher);
  const result = await client.edit({
    image: png,
    prompt: "把天空改成日落",
    protocol: "gemini",
    aspectRatio: "16:9",
  });

  assert.equal(result.protocol, "gemini");
  assert.equal(result.images.length, 1);
});

test("图片编辑支持本地源图片路径", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "image-edit-"));
  const sourcePath = path.join(directory, "source.png");
  await writeFile(sourcePath, Buffer.from(png, "base64"));
  try {
    const fetcher: typeof fetch = async (_input, init) => {
      assert.ok(init?.body instanceof FormData);
      const image = init.body.get("image");
      assert.ok(image instanceof Blob);
      assert.equal(Buffer.from(await image.arrayBuffer()).toString("base64"), png);
      return new Response(JSON.stringify({ data: [{ b64_json: png }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = new NewApiImageClient(config, fetcher);
    await client.edit({ image: sourcePath, prompt: "增加对比度" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("图片编辑会拒绝无效的源图片", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response();
  };
  const client = new NewApiImageClient(config, fetcher);

  await assert.rejects(
    () => client.edit({ image: "not a valid image", prompt: "编辑" }),
    /有效的 Base64 数据、本地文件路径或 data URL/,
  );
  assert.equal(calls, 0);
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
