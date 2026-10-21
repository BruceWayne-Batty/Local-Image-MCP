import assert from "node:assert/strict";
import test from "node:test";
import {
  geminiGenerateUrl,
  openAIImageEditsUrl,
  openAIImagesUrl,
} from "../src/url.js";

test("构造 OpenAI 图片 URL", () => {
  assert.equal(
    openAIImagesUrl("https://api.example.com"),
    "https://api.example.com/v1/images/generations",
  );
  assert.equal(
    openAIImagesUrl("https://api.example.com/v1/"),
    "https://api.example.com/v1/images/generations",
  );
  assert.equal(
    openAIImagesUrl("https://api.example.com/v1/images/generations"),
    "https://api.example.com/v1/images/generations",
  );
});

test("构造 OpenAI 图片编辑 URL", () => {
  assert.equal(
    openAIImageEditsUrl("https://api.example.com"),
    "https://api.example.com/v1/images/edits",
  );
  assert.equal(
    openAIImageEditsUrl("https://api.example.com/v1/images/generations"),
    "https://api.example.com/v1/images/edits",
  );
  assert.equal(
    openAIImageEditsUrl("https://api.example.com/v1/images/edits"),
    "https://api.example.com/v1/images/edits",
  );
});

test("构造 Gemini generateContent URL", () => {
  assert.equal(
    geminiGenerateUrl("https://api.example.com", "gemini image"),
    "https://api.example.com/v1beta/models/gemini%20image:generateContent",
  );
  assert.equal(
    geminiGenerateUrl("https://api.example.com/v1beta", "gemini-2.5"),
    "https://api.example.com/v1beta/models/gemini-2.5:generateContent",
  );
});
