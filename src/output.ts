import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GeneratedImage } from "./types.js";

const EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export async function saveImages(
  outputDir: string,
  images: GeneratedImage[],
  requestedName?: string,
): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });
  const safeStem = sanitizeStem(requestedName || timestampName());

  return Promise.all(
    images.map(async (image, index) => {
      const extension = EXTENSIONS[image.mimeType] || ".png";
      const suffix = images.length > 1 ? `-${index + 1}` : "";
      const filePath = path.join(outputDir, `${safeStem}${suffix}${extension}`);
      await writeFile(filePath, Buffer.from(image.data, "base64"));
      return filePath;
    }),
  );
}

function sanitizeStem(value: string): string {
  const withoutExtension = value.replace(/\.(png|jpe?g|webp|gif)$/i, "");
  const safe = withoutExtension
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 100);
  return safe || timestampName();
}

function timestampName(): string {
  return `image-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}
