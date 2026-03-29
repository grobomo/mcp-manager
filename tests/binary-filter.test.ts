/**
 * Tests for binary-filter.ts — base64 image/resource interception
 *
 * Uses Node built-in test runner (node:test). Run with:
 *   npx tsx --test tests/binary-filter.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, unlinkSync } from "fs";

const { processBinaryContent, hasBinaryContent, getBinaryTempDir } = await import("../src/binary-filter.js");

// ============ processBinaryContent ============

describe("binary-filter: processBinaryContent", () => {
  it("returns empty array for undefined content", () => {
    const result = processBinaryContent(undefined, "test-server");
    assert.deepEqual(result, []);
  });

  it("passes through non-array content as-is", () => {
    const result = processBinaryContent("not an array" as any, "test-server");
    assert.equal(result as any, "not an array");
  });

  it("passes through text content unchanged", () => {
    const content = [{ type: "text" as const, text: "hello world" }];
    const result = processBinaryContent(content, "test-server");
    assert.equal(result.length, 1);
    assert.equal((result[0] as any).type, "text");
    assert.equal((result[0] as any).text, "hello world");
  });

  it("converts image content to file reference", () => {
    // Small 1x1 red PNG in base64
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    const content = [{
      type: "image" as const,
      data: pngBase64,
      mimeType: "image/png",
    }];

    const result = processBinaryContent(content, "test-server");
    assert.equal(result.length, 1);
    assert.equal((result[0] as any).type, "text");
    assert.match((result[0] as any).text, /Image saved to:/);
    assert.match((result[0] as any).text, /image\/png/);

    // Verify file was actually written
    const pathMatch = (result[0] as any).text.match(/Image saved to: (.+)\]/);
    assert.ok(pathMatch, "should contain file path");
    const filePath = pathMatch[1];
    assert.ok(existsSync(filePath), "file should exist on disk");

    // Clean up
    try { unlinkSync(filePath); } catch {}
  });

  it("converts resource with blob to file reference", () => {
    const content = [{
      type: "resource" as const,
      resource: {
        uri: "file:///test.bin",
        mimeType: "application/octet-stream",
        blob: "AQIDBA==", // [1,2,3,4] in base64
      },
    }];

    const result = processBinaryContent(content, "test-server");
    assert.equal(result.length, 1);
    assert.equal((result[0] as any).type, "text");
    assert.match((result[0] as any).text, /Resource saved to:/);
    assert.match((result[0] as any).text, /file:\/\/\/test\.bin/);

    // Clean up
    const pathMatch = (result[0] as any).text.match(/Resource saved to: (.+)\]/);
    if (pathMatch) try { unlinkSync(pathMatch[1]); } catch {}
  });

  it("detects and converts large base64 strings in arbitrary fields", () => {
    // Create a string > 10000 chars that looks like base64
    const largeBase64 = "A".repeat(12000);
    const content = [{ type: "custom", data: largeBase64 } as any];

    const result = processBinaryContent(content, "test-server");
    assert.equal(result.length, 1);
    assert.match((result[0] as any).data, /Binary data saved to:/);

    // Clean up
    const pathMatch = (result[0] as any).data.match(/saved to: (.+)\]/);
    if (pathMatch) try { unlinkSync(pathMatch[1]); } catch {}
  });

  it("leaves small strings alone even if base64-like", () => {
    const content = [{ type: "custom", data: "AQIDBA==" } as any];
    const result = processBinaryContent(content, "test-server");
    assert.equal((result[0] as any).data, "AQIDBA==");
  });

  it("handles mixed content array", () => {
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    const content = [
      { type: "text" as const, text: "before" },
      { type: "image" as const, data: pngBase64, mimeType: "image/png" },
      { type: "text" as const, text: "after" },
    ];

    const result = processBinaryContent(content, "test-server");
    assert.equal(result.length, 3);
    assert.equal((result[0] as any).text, "before");
    assert.match((result[1] as any).text, /Image saved to:/);
    assert.equal((result[2] as any).text, "after");

    // Clean up
    const pathMatch = (result[1] as any).text.match(/Image saved to: (.+)\]/);
    if (pathMatch) try { unlinkSync(pathMatch[1]); } catch {}
  });
});

// ============ hasBinaryContent ============

describe("binary-filter: hasBinaryContent", () => {
  it("returns false for undefined", () => {
    assert.equal(hasBinaryContent(undefined), false);
  });

  it("returns false for text-only content", () => {
    assert.equal(hasBinaryContent([{ type: "text", text: "hi" }]), false);
  });

  it("returns true for image content", () => {
    assert.equal(hasBinaryContent([{ type: "image", data: "abc" }] as any), true);
  });

  it("returns true for resource with blob", () => {
    assert.equal(hasBinaryContent([{
      type: "resource",
      resource: { uri: "x", blob: "abc" },
    }] as any), true);
  });

  it("returns true for large base64 string", () => {
    assert.equal(hasBinaryContent([{
      type: "custom",
      data: "A".repeat(12000),
    }] as any), true);
  });

  it("returns false for large non-base64 string", () => {
    // Contains spaces — not valid base64
    assert.equal(hasBinaryContent([{
      type: "custom",
      data: "Hello World ".repeat(1000),
    }] as any), false);
  });
});

// ============ getBinaryTempDir ============

describe("binary-filter: getBinaryTempDir", () => {
  it("returns a string path", () => {
    const dir = getBinaryTempDir();
    assert.equal(typeof dir, "string");
    assert.ok(dir.length > 0);
  });
});
