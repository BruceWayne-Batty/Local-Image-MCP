import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { saveImages } from "../src/output.js";

test("保存图片并清理不安全的文件名", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "image-mcp-"));
  try {
    const paths = await saveImages(
      dir,
      [{ data: Buffer.from("image-data").toString("base64"), mimeType: "image/jpeg" }],
      "../my:image.png",
    );
    assert.equal(path.dirname(paths[0]!), dir);
    assert.equal(path.basename(paths[0]!), "-my-image.jpg");
    assert.equal((await readFile(paths[0]!)).toString(), "image-data");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
