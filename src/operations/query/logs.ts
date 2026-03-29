/**
 * mcpm logs operation — tail recent log entries, optionally filtered by server
 */

import { existsSync, readFileSync } from "fs";
import type { McpmContext, McpmParams, OperationResult } from "../types.js";

const DEFAULT_LINES = 50;
const MAX_LINES = 200;

export async function logs(ctx: McpmContext, params: McpmParams): Promise<OperationResult> {
  const logFile = ctx.BASE_DIR + "/mcp-manager.log";

  if (!existsSync(logFile)) {
    return { content: [{ type: "text", text: "No log file found." }] };
  }

  let content: string;
  try {
    content = readFileSync(logFile, "utf-8");
  } catch (e: any) {
    return { content: [{ type: "text", text: `Error reading log: ${e.message}` }] };
  }

  let lines = content.split("\n").filter(Boolean);
  const serverName = params.server;

  if (serverName) {
    lines = lines.filter(line =>
      line.includes(`[${serverName}]`) || line.includes(serverName)
    );
  }

  // Tail the last N lines
  const count = Math.min(MAX_LINES, DEFAULT_LINES);
  const tail = lines.slice(-count);

  const header = serverName
    ? `## Logs for ${serverName} (last ${tail.length} of ${lines.length} matching)`
    : `## Logs (last ${tail.length} of ${lines.length} total)`;

  return {
    content: [{ type: "text", text: [header, "", ...tail].join("\n") }],
  };
}
