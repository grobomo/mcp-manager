/**
 * Tests for metrics — recording, formatting, persistence
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { stringify as stringifyYaml } from "yaml";

const { recordCall, getMetrics, formatMetrics, resetMetrics, initMetrics, saveMetrics } =
  await import("../src/metrics.js");

let tempDir: string;

beforeEach(() => {
  resetMetrics();
  tempDir = mkdtempSync(join(tmpdir(), "metrics-test-"));
});

afterEach(() => {
  resetMetrics();
  try { rmSync(tempDir, { recursive: true }); } catch {}
});

// ============ recordCall / getMetrics ============

describe("metrics: recording", () => {
  it("records a successful call", () => {
    recordCall("wiki-lite", 150, false);
    const m = getMetrics();
    assert.equal(m["wiki-lite"].calls, 1);
    assert.equal(m["wiki-lite"].errors, 0);
    assert.equal(m["wiki-lite"].totalLatencyMs, 150);
    assert.equal(m["wiki-lite"].maxLatencyMs, 150);
  });

  it("records an error call", () => {
    recordCall("wiki-lite", 200, true);
    const m = getMetrics();
    assert.equal(m["wiki-lite"].errors, 1);
    assert.equal(m["wiki-lite"].calls, 1);
  });

  it("accumulates multiple calls", () => {
    recordCall("wiki-lite", 100, false);
    recordCall("wiki-lite", 300, false);
    recordCall("wiki-lite", 50, true);
    const m = getMetrics();
    assert.equal(m["wiki-lite"].calls, 3);
    assert.equal(m["wiki-lite"].errors, 1);
    assert.equal(m["wiki-lite"].totalLatencyMs, 450);
    assert.equal(m["wiki-lite"].maxLatencyMs, 300);
  });

  it("tracks separate servers independently", () => {
    recordCall("wiki-lite", 100, false);
    recordCall("v1-lite", 200, false);
    const m = getMetrics();
    assert.equal(m["wiki-lite"].calls, 1);
    assert.equal(m["v1-lite"].calls, 1);
  });
});

// ============ formatMetrics ============

describe("metrics: formatting", () => {
  it("returns no-data message when empty", () => {
    assert.match(formatMetrics(), /No calls recorded/);
  });

  it("formats metrics table", () => {
    recordCall("wiki-lite", 100, false);
    recordCall("wiki-lite", 200, true);
    const output = formatMetrics();
    assert.match(output, /Call Metrics/);
    assert.match(output, /wiki-lite/);
    assert.match(output, /2/); // calls
    assert.match(output, /1/); // errors
  });
});

// ============ persistence ============

describe("metrics: persistence", () => {
  it("saves and loads metrics round-trip", () => {
    initMetrics(tempDir);
    recordCall("wiki-lite", 100, false);
    recordCall("v1-lite", 200, true);
    saveMetrics();

    // Reset in-memory, then reload
    resetMetrics();
    initMetrics(tempDir);

    const m = getMetrics();
    assert.equal(m["wiki-lite"].calls, 1);
    assert.equal(m["wiki-lite"].totalLatencyMs, 100);
    assert.equal(m["v1-lite"].calls, 1);
    assert.equal(m["v1-lite"].errors, 1);
  });

  it("does not crash when metrics.yaml does not exist", () => {
    initMetrics(tempDir);
    const m = getMetrics();
    assert.deepEqual(m, {});
  });

  it("does not save when no metrics recorded", () => {
    initMetrics(tempDir);
    saveMetrics();
    const metricsPath = join(tempDir, "metrics.yaml");
    assert.throws(() => readFileSync(metricsPath), /ENOENT/);
  });

  it("ignores corrupt metrics file", () => {
    writeFileSync(join(tempDir, "metrics.yaml"), "not: [valid: yaml: {{{");
    // Should not throw
    initMetrics(tempDir);
    const m = getMetrics();
    assert.deepEqual(m, {});
  });

  it("skips entries without calls field", () => {
    const data = {
      "good-server": { calls: 5, errors: 1, totalLatencyMs: 500, maxLatencyMs: 200, lastCallAt: 123 },
      "bad-entry": { description: "no calls field" },
    };
    writeFileSync(join(tempDir, "metrics.yaml"), stringifyYaml(data));
    initMetrics(tempDir);
    const m = getMetrics();
    assert.equal(m["good-server"]?.calls, 5);
    assert.equal(m["bad-entry"], undefined);
  });
});
