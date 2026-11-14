import { createFileRoute } from "@tanstack/react-router";
import { type ComponentType, useCallback, useEffect, useState } from "react";
import {
  clearChunkReloadGuard,
  isDynamicImportError,
  loadWithRetry,
  shouldAttemptChunkReload,
} from "../lib/dynamicImportRecovery";

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
  const [LoadedApp, setLoadedApp] = useState<ComponentType | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [attemptSeq, setAttemptSeq] = useState(0);

  const retryLoad = useCallback(() => {
    setLoadError(null);
    setAttemptSeq((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    loadWithRetry(() => import("@/smfta/AppEntry"), {
      retries: 3,
      delayMs: 300,
      isCancelled: () => cancelled,
    })
      .then((mod) => {
        if (cancelled) return;
        clearChunkReloadGuard(
          typeof window !== "undefined" ? window.sessionStorage : null
        );
        setLoadedApp(() => mod.default);
      })
      .catch((err) => {
        if (cancelled) return;
        if (
          typeof window !== "undefined" &&
          isDynamicImportError(err) &&
          shouldAttemptChunkReload(window.sessionStorage)
        ) {
          window.location.reload();
          return;
        }
        setLoadError(err);
      });

    return () => {
      cancelled = true;
    };
  }, [attemptSeq]);

  if (loadError) {
    return (
      <div id="root">
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              This page didn&apos;t load
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              অ্যাপের মডিউল লোড হতে সাময়িক সমস্যা হয়েছে। নিচের বাটনে ক্লিক করে আবার চেষ্টা করুন।
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={retryLoad}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent cursor-pointer"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <div id="root">{LoadedApp ? <LoadedApp /> : null}</div>;
}
