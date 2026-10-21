import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AppConfig,
  EditImageInput,
  GeneratedImage,
  GenerateImageInput,
  GenerationResult,
} from "./types.js";
import {
  geminiGenerateUrl,
  openAIImageEditsUrl,
  openAIImagesUrl,
} from "./url.js";

interface OpenAIImageItem {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: { data?: string; mimeType?: string };
  inline_data?: { data?: string; mime_type?: string };
}

interface SourceImage {
  data: string;
  mimeType: string;
}

const SOURCE_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export class NewApiImageClient {
  constructor(
    private readonly config: AppConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async generate(input: GenerateImageInput): Promise<GenerationResult> {
    const protocol = input.protocol ?? this.config.defaultProtocol;
    return protocol === "gemini"
      ? this.generateGemini(input)
      : this.generateOpenAI(input);
  }

  async edit(input: EditImageInput): Promise<GenerationResult> {
    const protocol = input.protocol ?? this.config.defaultProtocol;
    const sourceImage = await loadSourceImage(input.image);
    return protocol === "gemini"
      ? this.editGemini(input, sourceImage)
      : this.editOpenAI(input, sourceImage);
  }

  private async postJson(url: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
          "x-goog-api-key": this.config.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 2000);
        throw new Error(`NEW API 请求失败 (${response.status}): ${detail}`);
      }
      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`NEW API 请求超时（${this.config.timeoutMs}ms）`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async postForm(url: string, body: FormData): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "x-goog-api-key": this.config.apiKey,
        },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 2000);
        throw new Error(`NEW API 请求失败 (${response.status}): ${detail}`);
      }
      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`NEW API 请求超时（${this.config.timeoutMs}ms）`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async downloadImage(url: string): Promise<GeneratedImage> {
    const response = await this.fetcher(url);
    if (!response.ok) {
      throw new Error(`下载生成图片失败 (${response.status})`);
    }
    const mimeType = response.headers.get("content-type")?.split(";")[0] || "image/png";
    const data = Buffer.from(await response.arrayBuffer()).toString("base64");
    return { data, mimeType };
  }

  private async generateOpenAI(
    input: GenerateImageInput,
  ): Promise<GenerationResult> {
    const model = input.model || this.config.openAIModel;
    const body: Record<string, unknown> = {
      model,
      prompt: buildPrompt(input.prompt, input.negativePrompt),
      n: input.count ?? 1,
    };
    if (input.size) body.size = input.size;
    if (input.quality) body.quality = input.quality;
    if (input.style) body.style = input.style;

    const raw = await this.postJson(openAIImagesUrl(this.config.baseUrl), body);
    const images = await this.parseOpenAIImages(raw);
    return { protocol: "openai", model, images };
  }

  private async editOpenAI(
    input: EditImageInput,
    sourceImage: SourceImage,
  ): Promise<GenerationResult> {
    const model = input.model || this.config.openAIModel;
    const body = new FormData();
    body.set("model", model);
    body.set("prompt", buildPrompt(input.prompt, input.negativePrompt));
    body.set("n", String(input.count ?? 1));
    if (input.size) body.set("size", input.size);
    if (input.quality) body.set("quality", input.quality);
    body.set(
      "image",
      new Blob([Buffer.from(sourceImage.data, "base64")], { type: sourceImage.mimeType }),
      `source${extensionForMimeType(sourceImage.mimeType)}`,
    );

    const raw = await this.postForm(openAIImageEditsUrl(this.config.baseUrl), body);
    const images = await this.parseOpenAIImages(raw);
    return { protocol: "openai", model, images };
  }

  private async parseOpenAIImages(raw: unknown): Promise<GeneratedImage[]> {
    const response = raw as { data?: OpenAIImageItem[] };
    if (!Array.isArray(response.data) || response.data.length === 0) {
      throw new Error("OpenAI 协议响应中没有图片数据");
    }

    return Promise.all(
      response.data.map(async (item) => {
        if (item.b64_json) {
          return {
            data: item.b64_json,
            mimeType: detectMimeType(item.b64_json),
            revisedPrompt: item.revised_prompt,
          };
        }
        if (item.url) {
          const image = await this.downloadImage(item.url);
          image.revisedPrompt = item.revised_prompt;
          return image;
        }
        throw new Error("OpenAI 协议返回了无法识别的图片格式");
      }),
    );
  }

  private async generateGemini(
    input: GenerateImageInput,
  ): Promise<GenerationResult> {
    const model = input.model || this.config.geminiModel;
    const generationConfig: Record<string, unknown> = {
      responseModalities: ["TEXT", "IMAGE"],
      candidateCount: input.count ?? 1,
    };
    const imageConfig: Record<string, unknown> = {};
    if (input.aspectRatio) imageConfig.aspectRatio = input.aspectRatio;
    if (input.imageSize) imageConfig.imageSize = input.imageSize;
    if (Object.keys(imageConfig).length > 0) {
      generationConfig.imageConfig = imageConfig;
    }
    if (input.seed !== undefined) generationConfig.seed = input.seed;

    const raw = await this.postJson(
      geminiGenerateUrl(this.config.baseUrl, model),
      {
        contents: [
          {
            role: "user",
            parts: [{ text: buildPrompt(input.prompt, input.negativePrompt) }],
          },
        ],
        generationConfig,
      },
    );
    const result = this.parseGeminiResponse(raw);
    return { protocol: "gemini", model, ...result };
  }

  private async editGemini(
    input: EditImageInput,
    sourceImage: SourceImage,
  ): Promise<GenerationResult> {
    const model = input.model || this.config.geminiModel;
    const generationConfig = buildGeminiGenerationConfig(input);
    const raw = await this.postJson(geminiGenerateUrl(this.config.baseUrl, model), {
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(input.prompt, input.negativePrompt) },
            { inlineData: sourceImage },
          ],
        },
      ],
      generationConfig,
    });
    const result = this.parseGeminiResponse(raw);
    return { protocol: "gemini", model, ...result };
  }

  private parseGeminiResponse(raw: unknown): Pick<GenerationResult, "images" | "text"> {
    const response = raw as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
    };

    const parts = (response.candidates ?? []).flatMap(
      (candidate) => candidate.content?.parts ?? [],
    );
    const images: GeneratedImage[] = [];
    const texts: string[] = [];
    for (const part of parts) {
      if (part.text) texts.push(part.text);
      const inline = part.inlineData ??
        (part.inline_data
          ? {
              data: part.inline_data.data,
              mimeType: part.inline_data.mime_type,
            }
          : undefined);
      if (inline?.data) {
        images.push({
          data: inline.data,
          mimeType: inline.mimeType || detectMimeType(inline.data),
        });
      }
    }
    if (images.length === 0) {
      const suffix = texts.length ? `；模型返回文本：${texts.join("\n")}` : "";
      throw new Error(`Gemini 协议响应中没有图片数据${suffix}`);
    }
    return { images, text: texts.join("\n") || undefined };
  }
}

function buildGeminiGenerationConfig(
  input: Pick<GenerateImageInput, "aspectRatio" | "imageSize" | "count" | "seed">,
): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    responseModalities: ["TEXT", "IMAGE"],
    candidateCount: input.count ?? 1,
  };
  const imageConfig: Record<string, unknown> = {};
  if (input.aspectRatio) imageConfig.aspectRatio = input.aspectRatio;
  if (input.imageSize) imageConfig.imageSize = input.imageSize;
  if (Object.keys(imageConfig).length > 0) {
    generationConfig.imageConfig = imageConfig;
  }
  if (input.seed !== undefined) generationConfig.seed = input.seed;
  return generationConfig;
}

async function loadSourceImage(value: string): Promise<SourceImage> {
  if (value.startsWith("data:")) return parseDataUrl(value);

  try {
    const file = await readFile(value);
    const mimeType = EXTENSION_MIME_TYPES[path.extname(value).toLowerCase()] ||
      detectMimeType(file.toString("base64"));
    return validateSourceImage({ data: file.toString("base64"), mimeType });
  } catch (error) {
    if (!(error instanceof Error) || !isMissingFile(error)) throw error;
  }

  const data = normalizeBase64(value);
  const mimeType = detectSourceMimeType(data);
  if (!mimeType) {
    throw new Error("图片必须是有效的 Base64 数据、本地文件路径或 data URL");
  }
  return validateSourceImage({
    data,
    mimeType,
  });
}

function parseDataUrl(value: string): SourceImage {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(value);
  if (!match) {
    throw new Error("图片 data URL 必须是 base64 编码的 image 数据");
  }
  return validateSourceImage({
    mimeType: normalizeMimeType(match[1]),
    data: normalizeBase64(match[2]),
  });
}

function validateSourceImage(image: SourceImage): SourceImage {
  if (!SOURCE_IMAGE_MIME_TYPES.has(image.mimeType)) {
    throw new Error("仅支持 PNG、JPEG 或 WebP 格式的源图片");
  }
  if (detectSourceMimeType(image.data) !== image.mimeType) {
    throw new Error("源图片数据不是有效的 PNG、JPEG 或 WebP 图片");
  }
  if (Buffer.from(image.data, "base64").length === 0) {
    throw new Error("源图片不能为空");
  }
  return image;
}

function normalizeBase64(value: string): string {
  const normalized = value.replace(/\s/g, "");
  if (!normalized || !/^[a-z0-9+/]*={0,2}$/i.test(normalized)) {
    throw new Error("图片必须是有效的 Base64 数据、本地文件路径或 data URL");
  }
  const withoutPadding = normalized.replace(/=+$/, "");
  const paddingLength = (4 - (withoutPadding.length % 4)) % 4;
  if (paddingLength === 3) {
    throw new Error("图片必须是有效的 Base64 数据、本地文件路径或 data URL");
  }
  return `${withoutPadding}${"=".repeat(paddingLength)}`;
}

function isMissingFile(error: Error): boolean {
  return "code" in error && error.code === "ENOENT";
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.toLowerCase() === "image/jpg" ? "image/jpeg" : mimeType.toLowerCase();
}

function extensionForMimeType(mimeType: string): string {
  return mimeType === "image/jpeg" ? ".jpg" : mimeType === "image/webp" ? ".webp" : ".png";
}

function detectSourceMimeType(base64: string): string | undefined {
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("UklGR")) return "image/webp";
  return undefined;
}

function buildPrompt(prompt: string, negativePrompt?: string): string {
  return negativePrompt
    ? `${prompt}\n\nAvoid / negative prompt: ${negativePrompt}`
    : prompt;
}

export function detectMimeType(base64: string): string {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  return "image/png";
}
