# mcp-manager

## Status: All review/cleanup complete. Project is stable and well-tested.

## Next (value-add features)
- [x] Add middleware tests to CI (GitHub Actions test job)
- [x] Server health check: detect crashed stdio processes, auto-restart if auto_start
- [x] Metrics: per-server call counts, errors, avg/max latency (in status output)
- [ ] Tool response caching for idempotent queries (reduce backend load)

## Completed (2026-03-28)
- [x] DRY: add MCP_ROOT to McpmContext, eliminate 4 duplicate computations
- [x] DRY: import BASE_DIR from utils.ts, fix CJS require in ESM, remove stale TODO
- [x] Refactor call.ts: extract server middleware into pluggable middleware.ts
- [x] context-reset: tested (dry-run works), already wired in stop hook auto-continue.js
- [x] Write tests for call.ts blueprint middleware (20 tests, all passing)
- [x] Add .github/workflows/secret-scan.yml (already existed)
- [x] Verify hook-runner enforcement-gate works with mcp-manager
- [x] Blueprint auto-enable middleware (auto-inject client_id, auto-enable on browser_* calls)
- [x] Required param validation for non-blueprint servers
- [x] Blueprint CLAUDE.md workflow docs
- [x] Fix package.json paths (dist/ -> build/)
- [x] Fix DEFAULT_IDLE_TIMEOUT inconsistency (single source in utils.ts)
- [x] Extract shared getProcessMemoryMB + formatBytes to utils.ts
- [x] Process exit cleanup handler
- [x] Remove PII from registry.ts discover
- [x] Archive dead code (logging.ts, organize/)
- [x] Track blueprint state in memory
- [x] Fix argsStr logging after middleware
- [x] hook-runner system (grobomo/hook-runner) — replaces hook-manager
- [x] context-reset project (grobomo/context-reset) — initial wrapper built
- [x] Jsonl transcript scanning for incomplete tangents — no tangents found
