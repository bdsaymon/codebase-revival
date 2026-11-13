# Codebase Revival

SMFTA AI workspace built with TypeScript, TanStack Start, Supabase/Lovable Cloud and multiple AI provider integrations.

## AI platform upgrade

The `feature/ai-platform-upgrade` branch introduces resilient AI orchestration utilities for context management, retries, timeouts, structured output parsing and deterministic usage estimation. Provider-specific routing remains in `src/smfta/server/providers.ts`; shared server-side helpers live in `src/smfta/server/aiPlatform.ts`.

## Development

```sh
bun install
bun run dev
```

## Validation

```sh
bun run lint
bun run typecheck
bun run test
bun run build
```

Never commit `.env` or provider credentials. Configure secrets in the deployment environment and use `.env.example` only as a variable-name template.
