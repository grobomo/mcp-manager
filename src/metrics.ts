/**
 * In-memory metrics for mcp-manager.
 * Tracks per-server call counts, errors, and latency.
 */

interface ServerMetrics {
  calls: number;
  errors: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
  lastCallAt: number;
}

const metrics: Record<string, ServerMetrics> = {};

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
