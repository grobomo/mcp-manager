# mcp-manager

## Status: All review tasks complete. Project is clean, built, pushed.

## Completed (2026-03-28)
- [x] Blueprint auto-enable middleware (auto-inject client_id, auto-enable on browser_* calls)
- [x] Required param validation for non-blueprint servers
- [x] Blueprint CLAUDE.md workflow docs
- [x] Fix package.json paths (dist/ -> build/)
- [x] Fix DEFAULT_IDLE_TIMEOUT inconsistency (single source in utils.ts)
- [x] Extract shared getProcessMemoryMB + formatBytes to utils.ts
- [x] Process exit cleanup handler
- [x] Remove PII from registry.ts discover
- [x] Archive dead code (logging.ts, organize/)
- [x] Track blueprint state in memory (no extra status call)
- [x] Fix argsStr logging after middleware

## Related projects shipped same session
- grobomo/hook-runner — modular hook system replacing hook-manager
- grobomo/context-reset — Python wrapper for Claude context reset (TODO items remain there)
- blueprint-extra-mcp CLAUDE.md — full workflow documentation

## Next session ideas (step 4: expand)
- [ ] Add more server-specific middleware in call.ts (like blueprint's, but for other servers that need special handling)
- [ ] Write tests for call.ts middleware
- [ ] context-reset: test the wrapper, wire as callable tool
