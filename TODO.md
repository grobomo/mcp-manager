# mcp-manager

## Status: All review tasks complete. Project stable. context-reset shipped.

## Completed (2026-03-28, session 1+2)
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
- [x] Middleware refactored to pluggable middleware.ts (done by session 2)
- [x] Metrics: per-server call counts, errors, latency (done by session 2)
- [x] Server health check with auto-restart (done by session 2)
- [x] Tests (20 passing, done by session 2)
- [x] CI: GitHub Actions test + secret-scan

## Related projects shipped
- grobomo/hook-runner — modular hook system (PreToolUse, PostToolUse, Stop)
- grobomo/context-reset — autonomous context reset via wt new-tab
- blueprint-extra-mcp CLAUDE.md — full workflow documentation
