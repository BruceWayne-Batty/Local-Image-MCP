# Image Edit Design

`image_edit` accepts a source image as a local path, data URL, or Base64 string plus an edit prompt. It supports both configured protocols while preserving the existing image-save and MCP-image response behavior.

For OpenAI, the MCP converts the image into a binary multipart part and posts it to `/v1/images/edits`. For Gemini, it embeds the normalized image as `inlineData` together with the edit prompt in the existing `generateContent` request. The server exposes common generation options where each protocol supports them, validates source inputs before sending any request, and reports actionable errors.

*** Add File: docs/plans/2026-09-23-image-edit-implementation.md
# Image Edit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an MCP `image_edit` tool that edits a supplied local or Base64 image through OpenAI or Gemini NEW API-compatible endpoints.

**Architecture:** Normalize all accepted source-image strings into base64 data and a MIME type once in the client. The OpenAI path submits that data as multipart form data to the image-edits endpoint; the Gemini path submits it as an inline content part before reusing the current Gemini response parser. The MCP server saves and returns output images exactly like `generate_image`.

**Tech Stack:** TypeScript, Node.js `fs/promises`, native `FormData` and `Blob`, MCP SDK, Zod, Node test runner.

---

### Task 1: Define and normalize edit input

**Files:**
- Modify: `src/types.ts`
- Modify: `src/client.ts`
- Test: `test/client.test.ts`

**Step 1: Write failing tests**

Cover parsing a Base64 data URL and a local fixture image. Assert invalid or missing image input produces a clear error before a request is made.

**Step 2: Implement minimal input support**

Add `EditImageInput` and a private source-image loader that accepts a data URL, pure Base64, or an existing local path. It returns Base64 data and a supported image MIME type.

**Step 3: Run focused tests**

Run: `npm test -- test/client.test.ts`

Expected: PASS.

### Task 2: Send protocol-specific edit requests

**Files:**
- Modify: `src/url.ts`
- Modify: `src/client.ts`
- Test: `test/client.test.ts`

**Step 1: Write failing tests**

Assert OpenAI targets `/v1/images/edits`, submits `multipart/form-data` fields and source-image bytes. Assert Gemini includes an `inlineData` source part with the edit prompt and image configuration.

**Step 2: Implement edit requests**

Add the edit URL helper, a multipart POST helper, and `edit`, `editOpenAI`, and `editGemini` client methods. Reuse current image response parsing and timeout/error behavior.

**Step 3: Run focused tests**

Run: `npm test -- test/client.test.ts`

Expected: PASS.

### Task 3: Register the MCP tool

**Files:**
- Modify: `src/server.ts`
- Test: `test/client.test.ts`

**Step 1: Add schema and tool handler**

Create the `image_edit` input schema with `image`, `prompt`, protocol selection, and compatible generation options. Use the edit client call, save outputs, and return paths and images in the existing response shape.

**Step 2: Build**

Run: `npm run build`

Expected: PASS.

### Task 4: Document and verify

**Files:**
- Modify: `README.md`

**Step 1: Document the tool**

Add parameter details and OpenAI/Gemini examples for `image_edit`, including all accepted image input forms.

**Step 2: Run full validation**

Run: `npm run check`

Expected: TypeScript compilation and all tests pass.
