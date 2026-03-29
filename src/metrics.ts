/**
 * Metrics for mcp-manager.
 * Tracks per-server call counts, errors, and latency.
 * Persists to metrics.yaml on save, reloads on start.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface ServerMetrics {
  calls: number;
  errors: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
  lastCallAt: number;
}

const metrics: Record<string, ServerMetrics> = {};
let metricsFile: string | null = null;

function ensure(server: string): ServerMetrics {
  if (!metrics[server]) {
    metrics[server] = { calls: 0, errors: 0, totalLatencyMs: 0, maxLatencyMs: 0, lastCallAt: 0 };
  }
  return metrics[server];
}

export function recordCall(server: string, latencyMs: number, isError: boolean): void {
  const m = ensure(server);
  m.calls++;
  if (isError) m.errors++;
  m.totalLatencyMs += latencyMs;
  if (latencyMs > m.maxLatencyMs) m.maxLatencyMs = latencyMs;
  m.lastCallAt = Date.now();
}

export function getMetrics(): Record<string, ServerMetrics> {
  return { ...metrics };
}

/** Clear all metrics (for testing). */
export function resetMetrics(): void {
  for (const key of Object.keys(metrics)) delete metrics[key];
  metricsFile = null;
}

/** Set the file path and load persisted metrics. Call once at startup. */
export function initMetrics(baseDir: string): void {
  metricsFile = join(baseDir, "metrics.yaml");
  if (!existsSync(metricsFile)) return;
  try {
    const data = parseYaml(readFileSync(metricsFile, "utf-8"));
    if (data && typeof data === "object") {
      for (const [name, m] of Object.entries(data) as [string, any][]) {
        if (m && typeof m.calls === "number") {
          metrics[name] = {
            calls: m.calls || 0,
            errors: m.errors || 0,
            totalLatencyMs: m.totalLatencyMs || 0,
            maxLatencyMs: m.maxLatencyMs || 0,
            lastCallAt: m.lastCallAt || 0,
          };
        }
      }
    }
  } catch {}
}

/** Write current metrics to disk. Call on exit. */
export function saveMetrics(): void {
  if (!metricsFile || Object.keys(metrics).length === 0) return;
  try {
    writeFileSync(metricsFile, stringifyYaml(metrics));
  } catch {}
}

export function formatMetrics(): string {
  const entries = Object.entries(metrics).sort((a, b) => b[1].calls - a[1].calls);
  if (entries.length === 0) return "No calls recorded yet.";

  const lines = ["## Call Metrics", ""];
  const header = "Server               Calls  Errors  Avg(ms)  Max(ms)";
  lines.push(header);
  lines.push("-".repeat(header.length));

  for (const [name, m] of entries) {
    const avg = m.calls > 0 ? Math.round(m.totalLatencyMs / m.calls) : 0;
    const nameCol = name.padEnd(21);
    const callsCol = String(m.calls).padStart(5);
    const errCol = String(m.errors).padStart(7);
    const avgCol = String(avg).padStart(8);
    const maxCol = String(Math.round(m.maxLatencyMs)).padStart(8);
    lines.push(`${nameCol}${callsCol}${errCol}${avgCol}${maxCol}`);
  }

  return lines.join("\n");
}
