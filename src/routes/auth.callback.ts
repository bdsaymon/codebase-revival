import { createFileRoute } from "@tanstack/react-router";

// OAuth return URL for the in-app integrations (GitHub, Vercel, Google
// Workspace, project database connections). Handled by the integrations engine.
export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { dispatchToLegacyApp } = await import("@/smfta/server/runtime/dispatch");
        return dispatchToLegacyApp(request);
      },
    },
  },
});
