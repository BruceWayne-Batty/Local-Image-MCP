function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Accepts a NEW API root URL as well as one already ending in /v1. */
export function openAIImagesUrl(baseUrl: string): string {
  const base = withoutTrailingSlash(baseUrl);
  if (/\/v1$/i.test(base)) return `${base}/images/generations`;
  if (/\/v1\/images\/generations$/i.test(base)) return base;
  return `${base}/v1/images/generations`;
}

/** Accepts a NEW API root URL as well as one already ending in /v1. */
export function openAIImageEditsUrl(baseUrl: string): string {
  const base = withoutTrailingSlash(baseUrl);
  if (/\/v1\/images\/edits$/i.test(base)) return base;
  if (/\/v1\/images\/generations$/i.test(base)) {
    return base.replace(/\/generations$/i, "/edits");
  }
  if (/\/v1$/i.test(base)) return `${base}/images/edits`;
  return `${base}/v1/images/edits`;
}

/** Accepts root, /v1beta, or a complete Gemini generateContent URL. */
export function geminiGenerateUrl(baseUrl: string, model: string): string {
  const base = withoutTrailingSlash(baseUrl);
  if (/:generateContent$/i.test(base)) return base;
  const prefix = /\/v1beta$/i.test(base)
    ? base
    : /\/v1$/i.test(base)
      ? base.replace(/\/v1$/i, "/v1beta")
      : `${base}/v1beta`;
  return `${prefix}/models/${encodeURIComponent(model)}:generateContent`;
}
