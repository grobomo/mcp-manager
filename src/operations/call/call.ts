/**
 * mcpm call - Execute tool on backend server
 */

import type { McpmContext, OperationResult, McpmParams } from "../types.js";
import { executeHooks } from "../../hooks.js";
import { processBinaryContent } from "../../binary-filter.js";
import { runMiddleware, hasMiddleware } from "./middleware.js";
import { recordCall } from "../../metrics.js";

export async function call(ctx: McpmContext, params: McpmParams): Promise<OperationResult> {
  const serverName = params.server;
  const toolName = params.tool;
  // Normalize arguments: accept string (JSON or raw) and convert to object
  let args: Record<string, any>;
  const rawArgs = params.arguments;
  if (typeof rawArgs === "string") {
    try {
      const parsed = JSON.parse(rawArgs);
      args = typeof parsed === "object" && parsed !== null ? parsed : { expression: rawArgs };
    } catch {
      args = { expression: rawArgs };
    }
    ctx.log(`CALL: normalized string arguments to object: ${JSON.stringify(args).slice(0, 100)}`);
  } else {
    args = rawArgs || {};
  }

  if (!serverName) {
    return { content: [{ type: "text", text: "Error: server parameter required" }] };
  }
  if (!toolName) {
    return { content: [{ type: "text", text: "Error: tool parameter required" }] };
  }

  // Check if server is allowed for this project
  if (!ctx.isServerAllowed(serverName)) {
    const projectInfo = ctx.projectName ? ` (project: ${ctx.projectName})` : "";
    ctx.log(`CALL ${serverName}:${toolName} -> BLOCKED: server not in allowedServers${projectInfo}`);
    return {
      content: [{
        type: "text",
        text: `Error: Server '${serverName}' is not allowed for this project${projectInfo}. Allowed: ${ctx.allowedServers?.join(", ") || "all"}`
      }]
    };
  }

  // Auto-start server if not running but exists in registry
  if (!(serverName in ctx.RUNNING)) {
    if (serverName in ctx.SERVERS && ctx.SERVERS[serverName].enabled !== false) {
      ctx.log(`CALL ${serverName}:${toolName} -> Auto-starting server...`);
      const [success, msg] = await ctx.startServer(serverName);
      if (!success) {
        ctx.log(`CALL ${serverName}:${toolName} -> ERROR: failed to auto-start: ${msg}`);
        return { content: [{ type: "text", text: `Failed to auto-start ${serverName}: ${msg}` }] };
      }
      ctx.log(`CALL ${serverName}:${toolName} -> Server auto-started successfully`);
    } else {
      ctx.log(`CALL ${serverName}:${toolName} -> ERROR: server not found or disabled`);
      return { content: [{ type: "text", text: `Server not found or disabled: ${serverName}` }] };
    }
  }

  // Run server-specific middleware (blueprint auto-enable, etc.)
  const mwResult = await runMiddleware(serverName, ctx, toolName, args);
  if (mwResult.error) return mwResult.error;
  args = mwResult.args;

  // Validate required params for servers without custom middleware
  if (!hasMiddleware(serverName)) {
    const serverTools = ctx.TOOLS[serverName] || [];
    const toolDef = serverTools.find(t => t.name === toolName);
    if (toolDef?.inputSchema) {
      const schema = toolDef.inputSchema as any;
      const required: string[] = schema.required || [];
      const missing = required.filter(p => !(p in args) || args[p] === undefined || args[p] === "");
      if (missing.length > 0) {
        ctx.log(`CALL ${serverName}:${toolName} -> missing required params: ${missing.join(", ")}`);
        return {
          content: [{
            type: "text",
            text: `Error: ${serverName}:${toolName} requires: ${missing.join(", ")}`
          }]
        };
      }
    }
  }

  // Log args after middleware (so auto-injected params show up)
  const finalArgsStr = JSON.stringify(args).slice(0, 200);
  ctx.log(`CALL ${serverName}:${toolName} args=${finalArgsStr}`);
  const startTime = Date.now();

  // Update last activity timestamp
  ctx.RUNNING[serverName].lastActivity = Date.now();

  try {
    const reqTimeout = ctx.SERVERS[serverName]?.timeout || 60000;
    const result = await ctx.callServerTool(reqTimeout, ctx.RUNNING[serverName], toolName, args);
    const elapsed = Date.now() - startTime;
    const rawContent = result?.content;
    const content = processBinaryContent(rawContent, serverName);

    let resultText: string;
    if (Array.isArray(content)) {
      const texts = content.filter((c: any) => c.type === "text").map((c: any) => c.text);
      resultText = texts.join("\n");
      const resultPreview = resultText.slice(0, 100).replace(/\n/g, " ");
      ctx.log(`CALL ${serverName}:${toolName} -> OK (${elapsed}ms) ${resultPreview}...`);
    } else {
      resultText = JSON.stringify(result, null, 2);
      ctx.log(`CALL ${serverName}:${toolName} -> OK (${elapsed}ms)`);
    }

    // Record metrics
    recordCall(serverName, elapsed, false);

    // Execute hooks (async, non-blocking)
    executeHooks(toolName, args, resultText, serverName, ctx.callServerTool, ctx.RUNNING, ctx.SERVERS, ctx.log);

    return { content: [{ type: "text", text: resultText }] };
  } catch (e: any) {
    const elapsed = Date.now() - startTime;
    recordCall(serverName, elapsed, true);
    ctx.log(`CALL ${serverName}:${toolName} -> ERROR (${elapsed}ms): ${e.message}`);

    // Auto-retry once if the error suggests a crashed server process
    const crashPatterns = ["stdin", "Server process exited", "EPIPE", "ERR_STREAM", "channel closed"];
    const isCrash = crashPatterns.some(p => e.message.includes(p));
    if (isCrash && serverName in ctx.SERVERS && ctx.SERVERS[serverName].enabled !== false) {
      ctx.log(`CALL ${serverName}:${toolName} -> server appears crashed, restarting and retrying...`);
      if (serverName in ctx.RUNNING) ctx.stopServer(serverName);
      const [started, startMsg] = await ctx.startServer(serverName);
      if (!started) {
        ctx.log(`CALL ${serverName}:${toolName} -> restart failed: ${startMsg}`);
        return { content: [{ type: "text", text: `Error: ${e.message} (restart failed: ${startMsg})` }] };
      }
      try {
        const reqTimeout = ctx.SERVERS[serverName]?.timeout || 60000;
        ctx.RUNNING[serverName].lastActivity = Date.now();
        const retryResult = await ctx.callServerTool(reqTimeout, ctx.RUNNING[serverName], toolName, args);
        const retryElapsed = Date.now() - startTime;
        recordCall(serverName, retryElapsed, false);
        const rawContent = retryResult?.content;
        const content = processBinaryContent(rawContent, serverName);
        let resultText: string;
        if (Array.isArray(content)) {
          resultText = content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
        } else {
          resultText = JSON.stringify(retryResult, null, 2);
        }
        ctx.log(`CALL ${serverName}:${toolName} -> RETRY OK (${retryElapsed}ms)`);
        executeHooks(toolName, args, resultText, serverName, ctx.callServerTool, ctx.RUNNING, ctx.SERVERS, ctx.log);
        return { content: [{ type: "text", text: resultText }] };
      } catch (retryErr: any) {
        const retryElapsed = Date.now() - startTime;
        recordCall(serverName, retryElapsed, true);
        ctx.log(`CALL ${serverName}:${toolName} -> RETRY FAILED (${retryElapsed}ms): ${retryErr.message}`);
        return { content: [{ type: "text", text: `Error after retry: ${retryErr.message}` }] };
      }
    }

    return { content: [{ type: "text", text: `Error: ${e.message}` }] };
  }
}
