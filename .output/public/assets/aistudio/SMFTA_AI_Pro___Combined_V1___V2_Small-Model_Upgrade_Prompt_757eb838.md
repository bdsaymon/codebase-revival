# SMFTA AI Pro — Combined V1 + V2 Small-Model Upgrade Prompt

Updated 15 Nov 2026 · Verified against the real codebase and Google's live model docs

## 0. Execution mode

ONE-SHOT. Do audit, plan, implement, test and final report in a single session without waiting for approval. This document is the approval. Stop only if source code is inaccessible, a required credential is truly missing, or a change would break Section 9 (Preservation rules). Otherwise choose the safest compliant option, continue, and record it in the final report.

SCOPE: V2 gets the full Gemini upgrade. V1 gets only a narrow, safe model-ID update (Section 1A) plus the shared never-stop-mid-answer fixes (Section 8A). Small models only, in both systems.

## 1. Architecture rules (unchanged)

- SMFTA V1 (Natural AI) keeps working exactly as it does today. The only V1 edits allowed are the ones listed in Section 1A and Section 8A.
- No change to V1 routing, provider list, user API keys, endpoints, fallback order, config, auth, settings or UI. No V2 dependency inside V1.
- All Gemini features, routing, quotas, RAG, memory and extra capabilities belong to V2 only. V1 and V2 stay isolated at inference, config and memory level.
- The app already exists. Do NOT rebuild it. No unrelated UI redesign.

## 1A. V1 — narrow, safe update (allowed)

Audit result: V1 has no Gemini settings of its own. Its three built-in keyless models are mapped in `src/smfta/server/runtime/lovableAi.ts` (`MODEL_MAP`) to the Lovable AI Gateway, and every target is a Gemini 2.5 model. From 1 Dec 2026 Google routes 2.5 requests to other models automatically, which silently changes answers, speed and cost. So V1 gets a model-ID update, nothing more.

| V1 preset | Now | Change to (small model) |
| --- | --- | --- |
| smfta-flash | google/gemini-2.5-flash-lite | google/gemini-3.1-flash-lite |
| smfta-pro | google/gemini-2.5-flash | google/gemini-3.8-flash |
| smfta-ultra | google/gemini-2.5-pro (big) | google/gemini-3.8-flash, with a larger output limit |
| default | google/gemini-2.5-flash | google/gemini-3.8-flash |

- Confirm each exact gateway ID in the Lovable Connectors → AI model list before writing it. If an ID is not listed, use google/gemini-3.8-flash. Never use a 2.5, preview or big model.
- In `src/smfta/server/providers.ts`, change only the `defaultModel` strings that are Gemini 2.5 or gemini-3.7-flash (retires 28 Jan 2027) to gemini-3.8-flash. Do not touch any other provider (OpenAI, Claude, Groq, DeepSeek and the rest use the user's own keys).
- Keep the free third-party fallback endpoint and the fallback order exactly as they are.
- Update V1 tests only where they assert the old model IDs.
- V1 changes are limited to this list and Section 8A. Anything else in V1 stays untouched, and the report must show a diff proving it.

V1's original free engine is the Xrahat AI API (`https://xrahat-worm-ai.vercel.app/api/chat`, a GET endpoint with `text`, `uid` and `stream` parameters). It is wired in `src/smfta/server/providers.ts` and `aiClient.ts`. Rules for it:

- Keep Xrahat exactly as V1's free fallback. Do not remove it, replace it, change its URL builder or reorder it. Trace the exact order of Xrahat and the Lovable gateway in `routes/chat.ts` and write it in the report, but do not change it.
- It has no model choice, no finish reason and no guarantee of uptime, so it must never be labelled as a Gemini model. When it answers, show the real source (SMFTA cloud fallback) and never a fake model name.
- Its prompt travels inside the URL, so history is trimmed to a URL-length budget. Keep that trimming, and make the continuation code in Section 8A work with it by detecting cut-off text by content only, because there is no finish reason.
- Apply the idle-timeout and stall retry from Section 8A to it, so a silent stream never freezes the chat.
- Report in plain words that the chat text of V1 users passes through this third-party service.

## 2. V2 presets: keep the 3 that already exist

The codebase already has exactly three V2 presets in `src/smfta/src/utils/v2UsageLimits.ts`: `smfta-v5`, `smfta-v2-pro`, `smfta-max`. Keep these IDs, labels, UI and daily quota logic. Do NOT add SMFTA Lite or SMFTA Ultra. Do NOT add a fourth or fifth preset.

Model picker map (from the real code, `App.tsx` and `utils/providers.ts`). Always target presets by internal ID, never by the label on screen, because "SMFTA Pro" appears in both groups:

| Where in the picker | System | Labels | Internal IDs |
| --- | --- | --- | --- |
| Top group (with Extended Thinking, Effort, Writing Style) | V2 Special | SMFTA Max, SMFTA Pro, SMFTA V5 | smfta-max, smfta-v2-pro, smfta-v5 |
| "More models" group | V1 Natural | SMFTA Flash, SMFTA Pro, SMFTA Ultra | smfta-flash, smfta-pro, smfta-ultra |

Do not rename labels, reorder the picker, or change the Settings and Connections screens (GitHub, Supabase, Vercel). Only the models behind the IDs change.

## 3. SMALL MODELS ONLY

Only small / Flash-class models are allowed.

| Preset | Model | Thinking level | Max output tokens |
| --- | --- | --- | --- |
| smfta-v5 | gemini-3.5-flash-lite | MINIMAL | 8192 |
| smfta-v2-pro | gemini-3.8-flash | LOW | 16384 |
| smfta-max | gemini-4-hydrogen | MEDIUM (set explicitly) | 32768 |

FORBIDDEN everywhere in V2 (code, config, tests, fallbacks):

- gemini-4-argon and gemini-4-carbon (big, expensive models)
- every Gemini 2.5 model, including the `firebaseAiModel` values still set to gemini-2.5-flash-lite and gemini-2.5-flash
- every preview or experimental ID, including gemini-3-flash-preview (currently used in the code)
- gemini-3.6-flash and gemini-3.7-flash (retired or retiring)

Model-specific parameter rules (do not invent parameters):

- gemini-3.8-flash and gemini-4-hydrogen REJECT thinking level MINIMAL. Use LOW, MEDIUM or HIGH only.
- gemini-4-hydrogen thinks at HIGH by default, so always set the level explicitly to MEDIUM. Never send thinkingBudget together with thinkingLevel (HTTP 400).
- gemini-4-hydrogen ignores temperature, topP and topK, so do not send them. It has no explicit context caching, only implicit caching.
- maxOutputTokens includes thinking tokens, so keep it large enough.
- Build a per-model parameter mapper so a fallback model never receives a setting it rejects.

Before writing any model ID into config, confirm it in the live List Models response for this project. If a model is missing, use the fallback chain below and record it.

## 4. Fallback: downward only, one pass

- smfta-max: gemini-4-hydrogen → gemini-3.8-flash → gemini-3.5-flash-lite
- smfta-v2-pro: gemini-3.8-flash → gemini-3.5-flash-lite
- smfta-v5: gemini-3.5-flash-lite only (one retry with backoff, no heavier model)

Rules:

- NEVER fall back to a heavier model than the one selected (the current code wrongly lets smfta-v5 fall up to gemini-3.8-flash; fix this).
- NEVER fall back to V1. A request traverses the chain at most once.
- On HTTP 429, quota exhaustion, timeout or 5xx: exponential backoff retry, then the next model down.
- Show the real model that answered and the real connection status. On fallback, show a short notice. Never show a fake ready/connected state.
- Keep the user's selected preset across sessions.

## 5. Inference route: ONE route only

Audit result from the real code: the chat path uses the server route (`streamV2FirebaseModel` in `src/smfta/server/v2FirebaseAi.ts`, called from `server/routes/chat.ts`, key in `GEMINI_API_KEY`). The client-side Firebase AI Logic code (`firebaseV2Client.ts`) is not used for chat, and App Check is not active (`recaptchaSiteKey` is empty).

- Keep the server route as the single primary V2 inference route. Add new endpoints as routers, as AGENTS.md requires.
- Do not create a competing second route for the same operation. Remove the unused `firebaseAiModel` 2.5 IDs or point them at the same small models, and do not use Firebase AI Logic for chat.
- If you do decide to use Firebase AI Logic for any operation, App Check enforcement is mandatory for it. Enable it with a real provider and a real site key, and record it.
- API keys live only in server environment variables. Never put them in frontend code, browser storage, logs or responses.
- Add response caching, per-user rate limiting, quota monitoring and error recovery. Quotas and usage are currently an in-memory Map, which is lost on restart. Persist them in Supabase (Lovable Cloud) tables with owner-only RLS.
- Edge runtime: there is no native disk or SQLite. Make any file parsing (PDF, DOCX, XLSX) work on the edge runtime, or parse in the browser and send text only.

## 6. Documents and RAG (V2 only)

- Formats: PDF, TXT, JSON, CSV, XLS/XLSX, DOCX.
- No vector store exists in the repo yet. Use the existing Supabase with pgvector and one embeddings table, owner-only RLS, V2-only. Do not add a new vector database.
- Chunk the text, embed it, retrieve only the relevant chunks, and show source references. Never send whole documents repeatedly.
- If retrieval finds nothing, say so honestly. Never fake a RAG answer.
- Preserve the existing upload and storage functionality exactly.
- Verify the embedding model ID in live List Models first. Never use a deprecated one.

## 7. Other V2 features (keep small and real)

- Reasoning and coding: step-by-step (plan → implement → self-review → fix) for large requests, JSON-schema structured output where supported. Do not expose chain-of-thought; show a short summary of the approach.
- Memory: V2 memory in its own store, isolated per user with RLS. Edit, delete one, and Clear All must really delete rows and vectors, verified by a test. Never overwrite or migrate V1 memory.
- Web search: Gemini grounding with Google Search on the models that support it. Cite real sources only, mark uncertain info, and handle failed searches honestly.
- Multimodal (add only what is clearly supported, otherwise disable the entry point and record it): image understanding through the routed small models; image generation with gemini-nano-banana-2.1; voice with gemini-3.8-live and the 3.8 TTS models. Never use 2.5 Live or 2.5 TTS models.
- Integrations (GitHub, Vercel, Supabase, MCP): keep what works, keep existing permissions and auth. Do not remove working integrations.

## 8. Security

Per-user isolation with RLS, secure key handling, tool permissions, rate limiting, safe file handling. Never expose keys, tokens or private data. Never fake auth or connection states.

## 8A. Never stop mid-answer (V1 and V2)

Audit result from the real code: auto-continuation already exists (`routes/chat.ts`, `streamGuard.ts`, idle timeout 75 s), but it has gaps that let answers stop halfway.

- `lovableAi.ts` (V1 gateway stream) ignores `finish_reason`, so an answer cut by the token limit is not recognised as cut. A dropped connection returns the partial text as a success, with no resume.
- `chat.ts` allows 4 continuation rounds while `streamGuard.ts` says 3. Use one shared constant.
- Gemini 3.8 Flash and Hydrogen count thinking tokens inside `maxOutputTokens`, so a low limit can cut the visible answer.

Required fixes:

1. Read `finish_reason` (OpenAI-style) and `finishReason` (Gemini) in every stream path, V1 gateway and V2 server. A value of length or MAX\_TOKENS means truncated, so continue.
2. If the stream drops mid-answer, keep the text already received and continue from its tail. Do not restart and do not duplicate text.
3. Keep the idle-timeout abort. After it, retry or continue. Never leave the chat bubble waiting.
4. Up to 3 continuation rounds, one shared constant. Stop if a round adds nothing, so there are no loops. If the answer is still incomplete, show a clear "continue" state instead of silently cutting.
5. V2 continuations must stay on the same V2 model chain. Never continue on V1 or on a heavier model.
6. Set output limits with thinking headroom (Section 3). Use LOW or MEDIUM thinking for long writing and code.
7. Big code or file requests: split into steps (plan, one file at a time, review). Always close open code fences, artifact tags and HTML documents.
8. Every failure shows a real, specific message with a retry: 429 rate limit, 402 out of Lovable credits, timeout, network. No blank bubble and no fake success.
9. Keep the cache rule: a truncated or failed answer is never cached.

## 9. Preservation rules

1. V1 changes are limited to Sections 1A and 8A. Everything else in V1 stays as it is.
2. No change to V1 routing, provider list, fallback order or API configs.
3. Do not delete providers or API configs.
4. Do not break auth.
5. Do not break chat history.
6. Do not remove memory.
7. Do not replace working settings pages.
8. No duplicate provider or API-management system.
9. No demo-only features.
10. No fake statuses.
11. No unrelated UI redesign.
12. No rebuild from scratch.

## 10. Phases (run all now)

1. AUDIT the real files and map V1, V2, the shared stream code, Firebase and Supabase use.
2. PLAN briefly, then continue without waiting.
3. IMPLEMENT incrementally: V2 upgrade, then the V1 model-ID update, then the Section 8A fixes.
4. TEST for real, never claim untested results:
   - V1 regression: smfta-flash, smfta-pro and smfta-ultra each answer a real chat; user-key providers, routing and fallback order unchanged.
   - Live List Models and one real call per V2 preset; each fallback step; thinking parameters per model.
   - Section 8A: simulate a token-limit cut and a dropped stream, and confirm the answer is completed once with no duplicated text.
   - Quota and error handling, RAG, memory delete, auth isolation.
   - Update tests that still reference 2.5 or preview models (`src/test/v2-firebase-system.test.ts`, `server/v2FirebaseAi.node-test.ts`).
5. FINAL REPORT: summary, files modified, files added, architecture, model config actually used (including any fallback substitution), V1 diff proving only Sections 1A and 8A changed, test results, known limitations, remaining tasks.

FINAL DIRECTIVE: upgrade, never replace. V2 becomes the independent Gemini-powered system on small, fast, low-cost models only. V1 keeps its behaviour and gets only the model-ID update and the never-stop-mid-answer fixes. Every answer must finish, and every error must be shown honestly.
