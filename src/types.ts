export type ImageProtocol = "openai" | "gemini";

export interface AppConfig {
  baseUrl: string;
  apiKey: string;
  defaultProtocol: ImageProtocol;
  openAIModel: string;
  geminiModel: string;
  outputDir: string;
  timeoutMs: number;
}

export interface GenerateImageInput {
  prompt: string;
  protocol?: ImageProtocol;
  model?: string;
  size?: string;
  aspectRatio?: string;
  imageSize?: string;
  count?: number;
  quality?: string;
  style?: string;
  negativePrompt?: string;
  seed?: number;
  fileName?: string;
}

export interface EditImageInput {
  image: string;
  prompt: string;
  protocol?: ImageProtocol;
  model?: string;
  size?: string;
  aspectRatio?: string;
  imageSize?: string;
  count?: number;
  quality?: string;
  negativePrompt?: string;
  seed?: number;
  fileName?: string;
}

export interface GeneratedImage {
  data: string;
  mimeType: string;
  revisedPrompt?: string;
}

export interface GenerationResult {
  protocol: ImageProtocol;
  model: string;
  images: GeneratedImage[];
  text?: string;
}
