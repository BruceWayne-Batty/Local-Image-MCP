import type {
  AppConfig,
  GeneratedImage,
  GenerateImageInput,
  GenerationResult,
} from "./types.js";
import { geminiGenerateUrl, openAIImagesUrl } from "./url.js";

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

    const raw = (await this.postJson(openAIImagesUrl(this.config.baseUrl), body)) as {
      data?: OpenAIImageItem[];
      error?: unknown;
    };
    if (!Array.isArray(raw.data) || raw.data.length === 0) {
      throw new Error("OpenAI 协议响应中没有图片数据");
    }

    const images = await Promise.all(
      raw.data.map(async (item) => {
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
    return { protocol: "openai", model, images };
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

    const raw = (await this.postJson(
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
    )) as { candidates?: Array<{ content?: { parts?: GeminiPart[] } }> };

    const parts = (raw.candidates ?? []).flatMap(
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
    return {
      protocol: "gemini",
      model,
      images,
      text: texts.join("\n") || undefined,
    };
  }
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
