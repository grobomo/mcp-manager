/**
 * Tests for hooks.ts — pattern matching, argument extraction, conditions
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { findMatchingHooks, extractHookArgs, loadHooks } =
  await import("../src/hooks.js");

// loadHooks needs a real path — use a temp dir with no hooks.yaml to initialize empty state
loadHooks("/tmp/nonexistent-dir");

describe("hooks: pattern matching", () => {
  it("returns empty for no hooks loaded", () => {
    const matches = findMatchingHooks("browser_navigate");
    assert.equal(matches.length, 0);
  });
});

describe("hooks: extractHookArgs", () => {
  const baseHook = {
    target_server: "test-server",
    target_tool: "test_tool",
    extract: {} as Record<string, string>,
  };

  it("extracts from args.<field>", () => {
    const hook = { ...baseHook, extract: { url: "args.url" } };
    const result = extractHookArgs(hook, { url: "https://example.com" }, "result text", "srv", "tool");
    assert.deepEqual(result, { url: "https://example.com" });
  });

  it("extracts with regex:<pattern>", () => {
    const hook = { ...baseHook, extract: { port: "regex:port (\\d+)" } };
    const result = extractHookArgs(hook, {}, "Allocated port 9222", "srv", "tool");
    assert.deepEqual(result, { port: "9222" });
  });

  it("extracts literal with variable substitution", () => {
    const hook = { ...baseHook, extract: { source: "literal:${server}:${tool}" } };
    const result = extractHookArgs(hook, {}, "ok", "wiki-lite", "wiki_search");
    assert.deepEqual(result, { source: "wiki-lite:wiki_search" });
  });

  it("extracts result_summary:<length>", () => {
    const hook = { ...baseHook, extract: { summary: "result_summary:10" } };
    const result = extractHookArgs(hook, {}, "Hello World, this is a long result", "srv", "tool");
    assert.deepEqual(result, { summary: "Hello Worl" });
  });

  it("extracts raw result", () => {
    const hook = { ...baseHook, extract: { raw: "result" } };
    const result = extractHookArgs(hook, {}, "full result text", "srv", "tool");
    assert.deepEqual(result, { raw: "full result text" });
  });

  it("returns null when result_contains condition fails", () => {
    const hook = { ...baseHook, result_contains: "SUCCESS", extract: { raw: "result" } };
    const result = extractHookArgs(hook, {}, "FAILURE occurred", "srv", "tool");
    assert.equal(result, null);
  });

  it("passes when result_contains matches", () => {
    const hook = { ...baseHook, result_contains: "SUCCESS", extract: { raw: "result" } };
    const result = extractHookArgs(hook, {}, "Operation SUCCESS completed", "srv", "tool");
    assert.notEqual(result, null);
  });

  it("returns null when result_not_contains condition fails", () => {
    const hook = { ...baseHook, result_not_contains: "ERROR", extract: { raw: "result" } };
    const result = extractHookArgs(hook, {}, "ERROR: something broke", "srv", "tool");
    assert.equal(result, null);
  });

  it("returns null when no values extracted", () => {
    const hook = { ...baseHook, extract: { missing: "args.nonexistent" } };
    const result = extractHookArgs(hook, {}, "result", "srv", "tool");
    assert.equal(result, null);
  });

  it("handles invalid regex gracefully", () => {
    const hook = { ...baseHook, extract: { bad: "regex:[invalid" } };
    const result = extractHookArgs(hook, {}, "result", "srv", "tool");
    assert.equal(result, null);
  });
});
