/**
 * Shared types for mcpm operations
 */

export interface ServerConfig {
  name: string;
  description?: string;
  command?: string;
  url?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  auto_start?: boolean;
  tags?: string[];
  startup_delay?: number;
  timeout?: number;
  idle_timeout?: number;
}

export interface RunningServer {
  process?: import("child_process").ChildProcess;
  url?: string;
  startedAt: string;
  lastActivity: number;
  toolsCount: number;
  requestId: number;
  metadata: {
    cdpPort?: number;
    transport?: string;
    [key: string]: any;
  };
}

export interface Tool {
  name: string;
  description?: string;
  inputSchema?: object;
}

export interface CachedServer {
  description: string;
  enabled: boolean;
  running: boolean;
  tools: { name: string; description: string }[];
  lastUpdated: string;
}

export interface OperationResult {
  content: { type: "text"; text: string }[];
}

export interface McpmContext {
  SERVERS: Record<string, ServerConfig>;
  RUNNING: Record<string, RunningServer>;
  TOOLS: Record<string, Tool[]>;
  TOOL_MAP: Record<string, string>;
  BASE_DIR: string;
  SERVERS_FILE: string;
  log: (message: string) => void;
  loadServersConfig: () => number;
  loadCapabilitiesCache: () => Record<string, CachedServer>;
  updateCapabilitiesCache: () => void;
  saveServersConfig: () => void;
  startServer: (name: string) => Promise<[boolean, string]>;
  stopServer: (name: string) => [boolean, string];
  restartServer: (name: string) => Promise<[boolean, string]>;
  callServerTool: (timeout: number, server: RunningServer, toolName: string, args: any) => Promise<any>;
  readServerMetadata: (serverName: string) => Record<string, any> | null;
  // Per-project context (auto-detected, not user-changeable)
  projectName: string | null;
  allowedServers: string[] | null;  // null = all allowed
  isServerAllowed: (name: string) => boolean;
}

// Operation parameter types
export interface McpmParams {
  operation: string;
  server?: string;
  query?: string;
  tool?: string;
  arguments?: Record<string, any>;
  enabled?: boolean;
  auto_start?: boolean;
  // For add operation
  command?: string;
  args?: string[];
  description?: string;
  env?: Record<string, string>;
  tags?: string[];
  // For global_index
  action?: "scan" | "list" | "search";
}
