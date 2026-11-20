import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ChatProgress } from "../smfta/src/components/ChatProgress";

it("shows the active reply stage and prompt, without exposing attachment contents", () => {
  const prompt = "Summarize the report\n⟦FILE:report.txt⟧\nPrivate file contents\n⟦/FILE⟧";
  const preparing = renderToStaticMarkup(<ChatProgress phase="preparing" prompt={prompt} />);
  const responding = renderToStaticMarkup(<ChatProgress phase="responding" prompt={prompt} />);
  expect(preparing).toContain("Preparing reply");
  expect(responding).toContain("Writing reply");
  expect(responding).toContain("Summarize the report");
  expect(responding).not.toContain("Private file contents");
});
