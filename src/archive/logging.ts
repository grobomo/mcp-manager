/**
 * Logging with rotation - 500MB max, keep 5 files
 */
import { existsSync, statSync, unlinkSync, renameSync, appendFileSync } from "fs";
import { sanitizeLog } from "./utils.js";

const LOG_MAX_SIZE = 500 * 1024 * 1024;
const LOG_MAX_FILES = 5;

export function rotateLog(logFile: string): void {
  try {
    if (!existsSync(logFile)) return;
    const stats = statSync(logFile);
    if (stats.size < LOG_MAX_SIZE) return;
    
    const oldest = logFile + "." + LOG_MAX_FILES;
    if (existsSync(oldest)) unlinkSync(oldest);
    
    for (let i = LOG_MAX_FILES - 1; i >= 1; i--) {
      const from = i === 1 ? logFile : logFile + "." + i;
      const to = logFile + "." + (i + 1);
      if (existsSync(from)) renameSync(from, to);
    }
    
    if (existsSync(logFile)) renameSync(logFile, logFile + ".1");
  } catch (e) {
    console.error("Log rotation error:", e);
  }
}

export function logMessage(logFile: string, message: string, action?: string): void {
  const timestamp = new Date().toISOString();
  const sanitized = sanitizeLog(message);
  const actionTag = action ? "[" + action + "] " : "";
  const line = "[" + timestamp + "] " + actionTag + sanitized;
  console.error(line);
  try {
    rotateLog(logFile);
    appendFileSync(logFile, line + "\n");
  } catch { }
}

export function logFileAction(logFile: string, action: string, source: string, dest?: string): void {
  const msg = dest ? source + " -> " + dest : source;
  logMessage(logFile, msg, action);
}
