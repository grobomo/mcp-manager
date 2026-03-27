/**
 * Hooks system for mcp-manager
 *
 * Automatically triggers actions after tool calls based on hooks.yaml config.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";

// ============ Types ============

interface HookConfig {
  description?: string;
  target_server: string;
  target_tool: string;
  result_contains?: string;
  result_not_contains?: string;
  extract: Record<string, string>;
}

interface HooksFile {
  hooks: Record<string, HookConfig>;
  defaults?: {
    enabled?: boolean;
    async?: boolean;
    timeout?: number;
  };
}

// ============ State ============

let HOOKS: Record<string, HookConfig> = {};
let HOOKS_DEFAULTS = { enabled: true, async: true, timeout: 5000 };

// ============ Loading ============

export function loadHooks(basePath: string): number {
  const hooksFile = join(basePath, "hooks.yaml");

  if (!existsSync(hooksFile)) {
    return 0;
  }

  try {
    const content = readFileSync(hooksFile, "utf-8");
    const data = parseYaml(content) as HooksFile;

    HOOKS = data.hooks || {};
    if (data.defaults) {
      HOOKS_DEFAULTS = { ...HOOKS_DEFAULTS, ...data.defaults };
    }

    return Object.keys(HOOKS).length;
  } catch (e) {
    console.error(`Failed to load hooks: ${e}`);
    return 0;
  }
}

// ============ Matching ============

function matchesPattern(toolName: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return toolName.startsWith(prefix);
  }
  return toolName === pattern;
}

export function findMatchingHooks(toolName: string): [string, HookConfig][] {
  const matches: [string, HookConfig][] = [];

  for (const [pattern, config] of Object.entries(HOOKS)) {
    if (matchesPattern(toolName, pattern)) {
      matches.push([pattern, config]);
    }
  }

  return matches;
}

// ============ Extraction ============

function extractValue(
  spec: string,
  args: Record<string, any>,
  result: string,
  serverName: string,
  toolName: string
): string | null {
  // args.<field> - Get from arguments
  if (spec.startsWith("args.")) {
    const field = spec.slice(5);
    return args[field]?.toString() || null;
  }

  // regex:<pattern> - Extract from result
  if (spec.startsWith("regex:")) {
    const pattern = spec.slice(6);
    try {
      const match = result.match(new RegExp(pattern));
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  // literal:<value> - Literal with variable substitution
  if (spec.startsWith("literal:")) {
    let value = spec.slice(8);
    value = value.replace("${server}", serverName);
    value = value.replace("${tool}", toolName);
    return value;
  }

  // result_summary:<length> - First N chars of result
  if (spec.startsWith("result_summary:")) {
    const length = parseInt(spec.slice(15)) || 100;
    return result.slice(0, length).replace(/\n/g, " ");
  }

  // result - Raw result
  if (spec === "result") {
    return result;
  }

  return null;
}

export function extractHookArgs(
  hook: HookConfig,
  args: Record<string, any>,
  result: string,
  serverName: string,
  toolName: string
): Record<string, any> | null {
  // Check conditions
  if (hook.result_contains && !result.includes(hook.result_contains)) {
    return null;
  }
  if (hook.result_not_contains && result.includes(hook.result_not_contains)) {
    return null;
  }

  // Extract values
  const extracted: Record<string, any> = {};

  for (const [key, spec] of Object.entries(hook.extract)) {
    const value = extractValue(spec, args, result, serverName, toolName);
    if (value !== null) {
      extracted[key] = value;
    }
  }

  // Must have at least one extracted value
  if (Object.keys(extracted).length === 0) {
    return null;
  }

  return extracted;
}

// ============ Execution ============

export async function executeHooks(
  toolName: string,
  args: Record<string, any>,
  result: string,
  serverName: string,
  callServerTool: Function,
  RUNNING: Record<string, any>,
  SERVERS: Record<string, any>,
  log: Function
): Promise<void> {
  if (!HOOKS_DEFAULTS.enabled) return;

  const matches = findMatchingHooks(toolName);
  if (matches.length === 0) return;

  for (const [pattern, hook] of matches) {
    // Check if target server is running
    if (!(hook.target_server in RUNNING)) {
      log(`HOOK ${pattern} -> ${hook.target_server} not running, skipping`);
      continue;
    }

    // Extract arguments
    const hookArgs = extractHookArgs(hook, args, result, serverName, toolName);
    if (!hookArgs) {
      continue; // Conditions not met or no values extracted
    }

    log(`HOOK ${pattern} -> ${hook.target_server}.${hook.target_tool}`);

    // Execute hook (async by default)
    const executeHook = async () => {
      try {
        const timeout = HOOKS_DEFAULTS.timeout;
        await callServerTool(timeout, RUNNING[hook.target_server], hook.target_tool, hookArgs);
        log(`HOOK ${pattern} -> OK`);
      } catch (e: any) {
        log(`HOOK ${pattern} -> ERROR: ${e.message}`);
      }
    };

    if (HOOKS_DEFAULTS.async) {
      // Fire and forget
      executeHook();
    } else {
      await executeHook();
    }
  }
}
