/**
 * Shared utilities for mcp-manager
 *
 * TODO:
 * - Add more sensitive patterns as discovered
 * - Add file locking for concurrent access
 * - Add session ID generation
 */

import { resolve, join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Base paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const BASE_DIR = join(__dirname, "..");
export const MCP_ROOT = join(BASE_DIR, "..");

/**
 * Validate that a path is within the allowed MCP root directory.
 * Prevents path traversal attacks.
 */
export function validatePath(path: string): boolean {
  const resolved = resolve(path);
  const allowedRoot = resolve(MCP_ROOT);
  return resolved.startsWith(allowedRoot);
}

/**
 * Get validated absolute path, or null if invalid.
 */
export function getValidatedPath(path: string): string | null {
  const resolved = resolve(path);
  if (!validatePath(resolved)) {
    return null;
  }
  return resolved;
}

/**
 * Sanitize log output to remove sensitive data.
 * Filters: IPs, tokens, secrets, passwords, API keys.
 */
export function sanitizeLog(text: string): string {
  if (!text) return text;

  return text
    // IPv4 addresses
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[IP_REDACTED]")

    // GitHub tokens
    .replace(/ghp_[A-Za-z0-9]{36,}/g, "[GH_TOKEN]")
    .replace(/github_pat_[A-Za-z0-9_]{22,}/g, "[GH_PAT]")

    // OpenAI/Anthropic API keys
    .replace(/sk-[A-Za-z0-9]{32,}/g, "[API_KEY]")
    .replace(/sk-ant-[A-Za-z0-9\-]{32,}/g, "[ANTHROPIC_KEY]")

    // AWS keys
    .replace(/AKIA[A-Z0-9]{16}/g, "[AWS_ACCESS_KEY]")
    .replace(/[A-Za-z0-9/+=]{40}(?=\s|$|")/g, "[AWS_SECRET_KEY]")

    // Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9\-_.~+/]+=*/gi, "Bearer [REDACTED]")

    // Generic patterns
    .replace(/password[=:]\s*["']?[^\s"']+["']?/gi, "password=[REDACTED]")
    .replace(/token[=:]\s*["']?[^\s"']+["']?/gi, "token=[REDACTED]")
    .replace(/secret[=:]\s*["']?[^\s"']+["']?/gi, "secret=[REDACTED]")
    .replace(/api[_-]?key[=:]\s*["']?[^\s"']+["']?/gi, "api_key=[REDACTED]")

    // Atlassian tokens
    .replace(/[A-Za-z0-9]{24,}@[A-Za-z0-9\-]+\.atlassian\.net/g, "[ATLASSIAN_TOKEN]")

    // Base64 encoded secrets (likely)
    .replace(/eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g, "[JWT_TOKEN]");
}

/**
 * Generate a unique session ID for logging.
 * Format: timestamp-random
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Default idle timeout for servers: 1 hour.
 * Single source of truth — used by idle checker, status display, and details.
 */
export const DEFAULT_IDLE_TIMEOUT = 3600000;

/**
 * Get process memory usage in MB by PID.
 * Cross-platform: uses wmic on Windows, ps on Unix.
 */
export function getProcessMemoryMB(pid: number): number | null {
  try {
    const { execSync } = require("child_process");
    if (process.platform === "win32") {
      const output = execSync(
        `wmic process where ProcessId=${pid} get WorkingSetSize 2>nul`,
        { encoding: "utf-8", timeout: 5000 }
      ).trim();
      const match = output.match(/\d+/);
      if (!match) return null;
      return Math.round(parseInt(match[0], 10) / 1024 / 1024);
    } else {
      const output = execSync(`ps -o rss= -p ${pid}`, {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      return Math.round(parseInt(output, 10) / 1024);
    }
  } catch {
    return null;
  }
}

/**
 * Format MB value as human-readable string.
 */
export function formatBytes(mb: number | null): string {
  if (mb === null) return "?";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`;
  return `${mb}MB`;
}
