/**
 * Server-specific middleware for call operations.
 *
 * Each middleware can transform args, short-circuit with an error, or run
 * pre-call actions (like auto-enabling blueprint). Middleware is keyed by
 * server name and runs before the actual tool call.
 */

import type { McpmContext, OperationResult } from "../types.js";

/** Result of middleware execution */
export interface MiddlewareResult {
  /** Modified arguments (or original if unchanged) */
  args: Record<string, any>;
  /** If set, short-circuit the call and return this error */
  error?: OperationResult;
}

/** A middleware function for a specific server */
export type ServerMiddleware = (
  ctx: McpmContext,
  toolName: string,
  args: Record<string, any>,
) => Promise<MiddlewareResult>;

// ============ Blueprint-extra middleware ============

let blueprintEnabled = false;

/** Reset blueprint state (exported for testing) */
export function resetBlueprintState(): void {
  blueprintEnabled = false;
}

const blueprintMiddleware: ServerMiddleware = async (ctx, toolName, args) => {
  const clientId = ctx.projectName || "claude-code";

  // Auto-inject client_id for enable tool
  if (toolName === "enable" && !args.client_id) {
    args = { ...args, client_id: clientId };
    ctx.log(`CALL blueprint-extra:enable -> auto-injected client_id="${clientId}"`);
  }

  // Track enable/disable state transitions
  if (toolName === "enable") {
    blueprintEnabled = true;
  } else if (toolName === "disable") {
    blueprintEnabled = false;
  }

  // Auto-enable when calling browser_* tools and blueprint isn't enabled
  if (toolName.startsWith("browser_") && !blueprintEnabled) {
    ctx.log(`CALL blueprint-extra:${toolName} -> blueprint not enabled, auto-enabling...`);
    const reqTimeout = ctx.SERVERS["blueprint-extra"]?.timeout || 60000;
    try {
      const enableResult = await ctx.callServerTool(
        reqTimeout, ctx.RUNNING["blueprint-extra"], "enable", { client_id: clientId }
      );
      const enableText = enableResult?.content?.[0]?.text || JSON.stringify(enableResult);
      if (enableText.includes("isError") || enableText.includes("\u274C")) {
        ctx.log(`CALL blueprint-extra:${toolName} -> auto-enable failed`);
        blueprintEnabled = false;
        return {
          args,
          error: {
            content: [{
              type: "text",
              text: `Auto-enable failed for blueprint-extra:\n${enableText}\n\nFix the connection issue, then retry your ${toolName} call.`,
            }],
          },
        };
      }
      blueprintEnabled = true;
      ctx.RUNNING["blueprint-extra"].lastActivity = Date.now();
      ctx.log(`CALL blueprint-extra:${toolName} -> auto-enable succeeded`);
    } catch (e: any) {
      ctx.log(`CALL blueprint-extra:${toolName} -> auto-enable error: ${e.message}, proceeding anyway`);
    }
  }

  // Reset blueprint state if server stopped/restarted
  if (!("blueprint-extra" in ctx.RUNNING)) {
    blueprintEnabled = false;
  }

  return { args };
};

// ============ Middleware registry ============

const MIDDLEWARE: Record<string, ServerMiddleware> = {
  "blueprint-extra": blueprintMiddleware,
};

/**
 * Run server-specific middleware if registered.
 * Returns modified args and optional short-circuit error.
 */
export async function runMiddleware(
  serverName: string,
  ctx: McpmContext,
  toolName: string,
  args: Record<string, any>,
): Promise<MiddlewareResult> {
  const mw = MIDDLEWARE[serverName];
  if (!mw) return { args };
  return mw(ctx, toolName, args);
}

/**
 * Check if a server has middleware registered.
 * Used to skip generic param validation for servers with custom handling.
 */
export function hasMiddleware(serverName: string): boolean {
  return serverName in MIDDLEWARE;
}
