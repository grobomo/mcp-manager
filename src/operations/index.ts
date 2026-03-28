/**
 * mcpm operations dispatcher
 */

// Query operations
export { listServers } from "./query/list-servers.js";
export { search } from "./query/search.js";
export { details } from "./query/details.js";
export { tools } from "./query/tools.js";
export { status } from "./query/status.js";
export { help } from "./query/help.js";

// Call operation
export { call } from "./call/call.js";

// Admin operations
export { start, stop, restart, enable } from "./admin/lifecycle.js";
export { add, remove, reload, discover } from "./admin/registry.js";
export { usage, ram } from "./admin/usage.js";

// Types
export type { McpmContext, McpmParams, OperationResult } from "./types.js";

// Organization operations (archived to src/archive/organize.ts)
