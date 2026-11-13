# Platform update

## Completed on `feature/ai-platform-upgrade`
- [x] Fix custom-provider selection, exact-model routing and context limits
- [x] Remove app login/registration without exposing private records
- [x] Remove website live previews; retain code editing and export
- [x] Simplify home and settings
- [x] Short, relevant responses
- [x] Automated provider, settings persistence and long-code parsing tests
- [x] Desktop saved-provider and simulated 300-line code chat verification
- [x] Add AI platform utilities: context trimming, bounded retry/backoff, timeout helper, structured JSON parsing and usage estimation
- [x] Add utility tests and `typecheck` script
- [x] Remove tracked `.env` from feature branch and ignore local env files; rotate the exposed Supabase publishable key and consider history cleanup
- [x] Add SYSTEM IDENTITY & CORE DIRECTIVE module and connect it to system prompt
- [x] Add core directive tests

## In progress / pending
- [ ] Restore the existing full `systemPrompt.ts` behavior while layering in the new directive; preserve skills, widgets, self-update, notebook, project context and user settings
- [ ] Verify lockfile consistency with `package.json`
- [ ] Integrate AI platform helpers into the existing chat/provider route with characterization tests
- [ ] Add provider-level timeout/retry and safe fallback semantics; never retry after user-visible tokens have streamed
- [ ] Persist per-user usage through authenticated server-side storage and existing owner-only RLS
- [ ] Add provider health/diagnostics view without exposing credentials
- [ ] Add GitHub Actions CI (`lint`, `typecheck`, `test`, `build`); currently requires workflow-write permission
- [ ] Run checks and fix regressions
- [ ] Verify custom provider live replies — valid provider credentials required
- [ ] Verify Mercury live replies — existing credential returned HTTP 401; replacement required
- [ ] Review branch diff and open a pull request after checks pass
