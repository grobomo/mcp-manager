/**
 * mcpm call - Execute tool on backend server
 */

import type { McpmContext, OperationResult, McpmParams } from "../types.js";
import { executeHooks } from "../../hooks.js";
import { processBinaryContent } from "../../binary-filter.js";

// Track blueprint-extra enabled state to avoid status call per browser_* tool
let blueprintEnabled = false;

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

  // Blueprint-extra middleware: auto-inject client_id and auto-enable
  if (serverName === "blueprint-extra") {
    const clientId = ctx.projectName || "claude-code";

    // Auto-inject client_id for enable tool
    if (toolName === "enable" && !args.client_id) {
      args.client_id = clientId;
      ctx.log(`CALL ${serverName}:enable -> auto-injected client_id="${clientId}"`);
    }

    // Track enable/disable state transitions
    if (toolName === "enable") {
      blueprintEnabled = true;
    } else if (toolName === "disable") {
      blueprintEnabled = false;
    }

    // Auto-enable when calling browser_* tools and blueprint isn't enabled
    if (toolName.startsWith("browser_") && !blueprintEnabled) {
      ctx.log(`CALL ${serverName}:${toolName} -> blueprint not enabled, auto-enabling...`);
      const reqTimeout = ctx.SERVERS[serverName]?.timeout || 60000;
      try {
        const enableResult = await ctx.callServerTool(reqTimeout, ctx.RUNNING[serverName], "enable", { client_id: clientId });
        const enableText = enableResult?.content?.[0]?.text || JSON.stringify(enableResult);
        if (enableText.includes("isError") || enableText.includes("❌")) {
          ctx.log(`CALL ${serverName}:${toolName} -> auto-enable failed`);
          blueprintEnabled = false;
          return { content: [{ type: "text", text: `Auto-enable failed for blueprint-extra:\n${enableText}\n\nFix the connection issue, then retry your ${toolName} call.` }] };
        }
        blueprintEnabled = true;
        ctx.RUNNING[serverName].lastActivity = Date.now();
        ctx.log(`CALL ${serverName}:${toolName} -> auto-enable succeeded`);
      } catch (e: any) {
        ctx.log(`CALL ${serverName}:${toolName} -> auto-enable error: ${e.message}, proceeding anyway`);
      }
    }
  }

  // Reset blueprint state if server stopped/restarted
  if (serverName === "blueprint-extra" && !(serverName in ctx.RUNNING)) {
    blueprintEnabled = false;
  }

  // Validate required params for non-blueprint servers (blueprint is handled above)
  if (serverName !== "blueprint-extra") {
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

    // Execute hooks (async, non-blocking)
    executeHooks(toolName, args, resultText, serverName, ctx.callServerTool, ctx.RUNNING, ctx.SERVERS, ctx.log);

    return { content: [{ type: "text", text: resultText }] };
  } catch (e: any) {
    const elapsed = Date.now() - startTime;
    ctx.log(`CALL ${serverName}:${toolName} -> ERROR (${elapsed}ms): ${e.message}`);
    return { content: [{ type: "text", text: `Error: ${e.message}` }] };
  }
}
