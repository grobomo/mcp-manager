# mcp-manager

## Status: Review complete. Next: step 3 (optimize/harden) and step 4 (expand).

## In Progress
- [ ] Add server-specific middleware pattern in call.ts for other servers needing special handling
- [ ] context-reset: test wrapper, wire as callable tool from stop hook

## Completed (2026-03-28)
- [x] Write tests for call.ts blueprint middleware (21 tests, all passing)
- [x] Add .github/workflows/secret-scan.yml (already existed)
- [x] Verify hook-runner enforcement-gate works with mcp-manager (module installed, all checks pass)
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
