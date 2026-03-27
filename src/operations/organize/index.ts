/**
 * Organize operation - consolidate MCP servers to central repo
 */
import { existsSync, readdirSync, statSync, renameSync, appendFileSync } from "fs";
import { join, basename } from "path";
import { spawn } from "child_process";
import type { McpmContext } from "../types.js";

const LOG_FILE = join(process.env.MCP_REPO_PATH || "", "mcp-manager", "mcp-manager.log");

function logAction(action: string, msg: string): void {
  const ts = new Date().toISOString();
  const line = "[" + ts + "] [" + action + "] " + msg + "\n";
  try { appendFileSync(LOG_FILE, line); } catch {}
  console.error(line.trim());
}

export async function organize(ctx: McpmContext, params: { claude?: boolean; dryRun?: boolean }): Promise<[boolean, string]> {
  const repoPath = process.env.MCP_REPO_PATH;
  if (!repoPath) return [false, "MCP_REPO_PATH not set"];
  
  const archiveDir = join(repoPath, "archive");
  const dateStamp = new Date().toISOString().slice(0,10).replace(/-/g,"");
  
  logAction("ORGANIZE", "Starting organization scan");
  
  // Find duplicate servers
  const servers = readdirSync(repoPath).filter(f => 
    f.startsWith("mcp-") && statSync(join(repoPath, f)).isDirectory() && f !== "mcp-manager"
  );
  
  const result = ["Found " + servers.length + " servers in central repo"];
  
  if (params.claude) {
    logAction("CLAUDE_RUN", "Invoking claude -p for organization");
    const claudeLog = join(repoPath, "mcp-manager", "claude-organize-" + dateStamp + ".log");
    
    return new Promise((resolve) => {
      const proc = spawn("claude", ["-p", "List all MCP servers and check for duplicates or redundancy"], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      
      let output = "";
      proc.stdout?.on("data", (d) => { output += d.toString(); });
      proc.stderr?.on("data", (d) => { output += d.toString(); });
      
      proc.on("close", (code) => {
        try { appendFileSync(claudeLog, output); } catch {}
        logAction("CLAUDE_RUN", "Completed, log: " + claudeLog);
        resolve([true, "Claude analysis complete. Log: " + claudeLog]);
      });
      
      setTimeout(() => {
        proc.kill();
        resolve([false, "Claude timed out after 60s"]);
      }, 60000);
    });
  }
  
  return [true, result.join("\n")];
}
