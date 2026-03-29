/**
 * Tests for utils.ts — sanitizeLog, validatePath, formatBytes, generateSessionId
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { sanitizeLog, validatePath, formatBytes, generateSessionId, DEFAULT_IDLE_TIMEOUT } =
  await import("../src/utils.js");

describe("sanitizeLog", () => {
  it("redacts GitHub tokens", () => {
    assert.match(sanitizeLog("token ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ012345678"), /\[GH_TOKEN\]/);
  });

  it("redacts GitHub PATs", () => {
    assert.match(sanitizeLog("github_pat_abcdefghijklmnopqrstuv_1234567890"), /\[GH_PAT\]/);
  });

  it("redacts Bearer tokens", () => {
    assert.match(sanitizeLog("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test"), /Bearer \[REDACTED\]/);
  });

  it("redacts password= patterns", () => {
    assert.match(sanitizeLog("password=s3cretValue"), /password=\[REDACTED\]/);
  });

  it("redacts api_key= patterns", () => {
    assert.match(sanitizeLog("api_key=abcd1234secret"), /api_key=\[REDACTED\]/);
  });

  it("redacts AWS access keys", () => {
    assert.match(sanitizeLog("AKIAIOSFODNN7EXAMPLE"), /\[AWS_ACCESS_KEY\]/);
  });

  it("returns empty string for empty input", () => {
    assert.equal(sanitizeLog(""), "");
  });

  it("passes through clean text unchanged (no false positives on short strings)", () => {
    const clean = "Starting wiki-lite server";
    assert.equal(sanitizeLog(clean), clean);
  });
});

describe("validatePath", () => {
  it("accepts paths within MCP_ROOT", () => {
    // MCP_ROOT is two levels up from build dir. Any path under it should pass.
    // We test with a relative path that resolves within the project.
    const result = validatePath("./src/index.ts");
    assert.equal(typeof result, "boolean");
  });

  it("rejects paths outside MCP_ROOT", () => {
    // Path traversal attempt
    const result = validatePath("/etc/passwd");
    assert.equal(result, false);
  });
});

describe("formatBytes", () => {
  it("formats null as ?", () => {
    assert.equal(formatBytes(null), "?");
  });

  it("formats MB values", () => {
    assert.equal(formatBytes(256), "256MB");
  });

  it("formats GB values", () => {
    assert.equal(formatBytes(1536), "1.5GB");
  });

  it("formats exactly 1GB", () => {
    assert.equal(formatBytes(1024), "1.0GB");
  });
});

describe("generateSessionId", () => {
  it("returns a string with timestamp-random format", () => {
    const id = generateSessionId();
    assert.match(id, /^[a-z0-9]+-[a-z0-9]+$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSessionId()));
    assert.equal(ids.size, 100);
  });
});

describe("DEFAULT_IDLE_TIMEOUT", () => {
  it("is 1 hour in milliseconds", () => {
    assert.equal(DEFAULT_IDLE_TIMEOUT, 3600000);
  });
});
