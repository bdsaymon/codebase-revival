<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- The imported SMFTA AI Pro app lives in `src/smfta/src` (UI) and `src/smfta/server` (API engine); keep their relative imports intact — server code imports shared helpers from `../src`.
- The API engine's original Express routers run unchanged through `src/smfta/server/runtime/express.ts` + `dispatch.ts`, mounted by `src/routes/api/$.ts`, `src/routes/auth.callback.ts` and `src/routes/preview.$projectId.ts`; add new endpoints as routers there rather than a second API style.
- Engine storage uses `runtime/sqlite.ts` (sql.js asm build, in-memory) in place of `node:sqlite`, because the edge runtime has no native SQLite or writable disk; engine state is per server instance and must not hold user data that needs to persist.
- User data (profiles, settings state, chat sessions) is stored in Lovable Cloud tables `smfta_*` with owner-only RLS; the UI reaches them through `src/smfta/src/utils/supabaseClient.ts`, which wraps the generated client.
- The app UI is mounted client-only at `/` (lazy import after mount) because it reads browser storage during initialisation.
- tsconfig strict extras (index-signature access, unchecked index, exact optional) are off because the imported code was written against plain `strict`.
- Keyless built-in SMFTA models stream through the Lovable AI Gateway first (`src/smfta/server/runtime/lovableAi.ts`), with the old free third-party endpoint only as fallback, because that endpoint stalled replies.
- Shared website previews (`/preview/:id`) are stored in the `smfta_published_previews` table via the server admin client, because in-memory storage is lost between server instances and links broke on other devices.
- The API adapter rewrites the request host from forwarded/origin/referer headers (`resolvePublicOrigin`), because behind the hosting proxy the raw host is internal and OAuth links pointed at localhost.
- The SMFTA code workspace is a view inside the app at `/`; never change the browser address to open it, because the site router has no page for app-internal paths and shows a 404.
- Preserve explicit provider selections on save and dispatch; infer a vendor only for unset/built-in selections, because compatible services can share key prefixes.
- Build per-profile context limits and exact selected model IDs into ad-hoc provider configurations so chat and connection tests use the same constraints.
- Keep Settings controls in SettingsControls and persist edits through SettingsHub's sanitized commit path, so displayed values and chat requests stay consistent.
