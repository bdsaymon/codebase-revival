export function ChatProgress({
  phase,
  prompt,
}: {
  phase: "preparing" | "responding";
  prompt: string;
}) {
  const topic = prompt
    .replace(/⟦FILE:[^\n⟦]+⟧[\s\S]*?⟦\/FILE⟧/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const preview = topic.length > 72 ? `${topic.slice(0, 72)}…` : topic;

  return (
    <div
      role="status"
      className="flex min-w-0 items-center gap-2 px-1 py-2 text-xs text-[var(--ink-muted)]"
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)] motion-safe:animate-pulse"
      />
      <span className="shrink-0">
        {phase === "preparing" ? "Preparing reply" : "Writing reply"}
      </span>
      {preview && <span className="truncate">· {preview}</span>}
    </div>
  );
}
