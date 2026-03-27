/**
 * mcpm lifecycle operations - start, stop, restart, enable
 */

import type { McpmContext, OperationResult, McpmParams } from "../types.js";

export async function start(ctx: McpmContext, params: McpmParams): Promise<OperationResult> {
  const serverName = params.server;
  if (!serverName) {
    return { content: [{ type: "text", text: "Error: server parameter required" }] };
  }

  ctx.log(`START ${serverName}`);
  const [success, message] = await ctx.startServer(serverName);
  ctx.log(`START ${serverName} -> ${success ? "OK" : "FAILED"}: ${message}`);
  return { content: [{ type: "text", text: message }] };
}

export async function stop(ctx: McpmContext, params: McpmParams): Promise<OperationResult> {
  const serverName = params.server;
  if (!serverName) {
    return { content: [{ type: "text", text: "Error: server parameter required" }] };
  }

  ctx.log(`STOP ${serverName}`);
  const [success, message] = ctx.stopServer(serverName);
  ctx.log(`STOP ${serverName} -> ${success ? "OK" : "FAILED"}: ${message}`);
  return { content: [{ type: "text", text: message }] };
}

export async function restart(ctx: McpmContext, params: McpmParams): Promise<OperationResult> {
  const serverName = params.server;
  if (!serverName) {
    return { content: [{ type: "text", text: "Error: server parameter required" }] };
  }

  ctx.log(`RESTART ${serverName}`);
  const [success, message] = await ctx.restartServer(serverName);
  ctx.log(`RESTART ${serverName} -> ${success ? "OK" : "FAILED"}: ${message}`);
  return { content: [{ type: "text", text: message }] };
}

export async function enable(ctx: McpmContext, params: McpmParams): Promise<OperationResult> {
  const serverName = params.server;
  if (!serverName) {
    return { content: [{ type: "text", text: "Error: server parameter required" }] };
  }

  if (!(serverName in ctx.SERVERS)) {
    return { content: [{ type: "text", text: `Unknown server: ${serverName}` }] };
  }

  const enabled = params.enabled !== false;
  ctx.SERVERS[serverName].enabled = enabled;
  ctx.saveServersConfig();

  if (!enabled && serverName in ctx.RUNNING) {
    ctx.stopServer(serverName);
  }

  return { content: [{ type: "text", text: `${enabled ? "Enabled" : "Disabled"} server: ${serverName}` }] };
}
