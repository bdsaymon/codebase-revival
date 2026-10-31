import { createFileRoute } from "@tanstack/react-router";

// Published live-preview pages created from the Code Lab.
export const Route = createFileRoute("/preview/$projectId")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { dispatchToLegacyApp } = await import("@/smfta/server/runtime/dispatch");
        return dispatchToLegacyApp(request);
      },
    },
  },
});
