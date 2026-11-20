import { describe, expect, it } from "vitest";
import {
  dropStallSentences,
  hasIncompleteCodeArtifact,
  polishReply,
} from "../smfta/src/utils/streamGuard";

describe("coding reply integrity", () => {
  it.each([
    "```js\nconst app =",
    '<smfta_artifact filename="index.html">\n<p>Partial',
    "⟦FILE:index.html⟧\n<p>Partial",
    "<!doctype html>\n<html><body>Partial",
  ])("detects an incomplete deliverable: %s", (reply) => {
    expect(hasIncompleteCodeArtifact(reply)).toBe(true);
  });

  it("does not rewrite repeated code, indentation, or stall-like strings inside files", () => {
    const reply =
      '```js\n  console.log("please wait for the response");\n\n\n  console.log("please wait for the response");\n```';
    expect(hasIncompleteCodeArtifact(reply)).toBe(false);
    expect(dropStallSentences(polishReply(reply, { concise: true }))).toBe(reply);
  });

  it("accepts a fully closed HTML artifact", () => {
    expect(
      hasIncompleteCodeArtifact(
        '<smfta_artifact filename="index.html">\n<!doctype html><html><body>Done</body></html>\n</smfta_artifact>',
      ),
    ).toBe(false);
  });
});
