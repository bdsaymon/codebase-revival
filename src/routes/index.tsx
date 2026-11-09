import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

const SmftaApp = lazy(() => import("@/smfta/AppEntry"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SMFTA AI Pro" },
      {
        name: "description",
        content:
          "SMFTA AI: direct answers, Mercury and custom providers, code editing, Notebook and persistent on-device memory.",
      },
      { property: "og:title", content: "SMFTA AI Pro" },
      {
        property: "og:description",
        content:
          "SMFTA AI: direct answers, Mercury and custom providers, code editing, Notebook and persistent on-device memory.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div id="root" />;
  return (
    <div id="root">
      <Suspense fallback={null}>
        <SmftaApp />
      </Suspense>
    </div>
  );
}
