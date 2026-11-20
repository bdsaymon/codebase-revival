import { describe, expect, it, vi } from "vitest";
import { parseProtocolResponse } from "../smfta/server/engine/adapters";
import { streamFromLovableAi } from "../smfta/server/runtime/lovableAi";

describe("provider answer boundary", () => {
  it("never turns Gemini thought-only output into an answer", () => {
    const response = parseProtocolResponse("gemini_native", {
      candidates: [
        { finishReason: "MAX_TOKENS", content: { parts: [{ text: "Internal", thought: true }] } },
      ],
    });
    expect(response).toMatchObject({ text: "", thinking: "Internal", stopReason: "length" });
  });

  it("handles Gemini blocking a prompt before generating a candidate", () => {
    expect(
      parseProtocolResponse("gemini_native", {
        candidates: [],
        promptFeedback: { blockReason: "SAFETY" },
      }),
    ).toMatchObject({ text: "", stopReason: "content_filter" });
  });

  it("keeps compatible provider reasoning separate from the final answer", () => {
    expect(
      parseProtocolResponse("openai_compatible", {
        choices: [{ message: { reasoning_content: "Internal" } }],
      }),
    ).toMatchObject({ text: "", thinking: "Internal" });
  });

  it("sends image-only turns to the gateway and streams the answer", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    try {
      const emitDelta = vi.fn();
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('data: {"choices":[{"delta":{"content":"An image"}}]}\n\ndata: [DONE]\n\n'),
        );
      await expect(
        streamFromLovableAi({
          systemInstruction: "",
          history: [{ role: "user", content: "", imgs: [{ mime: "image/png", data: "YWJj" }] }],
          emitDelta,
          fetchImpl,
        }),
      ).resolves.toMatchObject({ ok: true });
      expect(
        JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).messages[0].content,
      ).toContainEqual({ type: "image_url", image_url: { url: "data:image/png;base64,YWJj" } });
      expect(emitDelta).toHaveBeenCalledWith("An image");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

it("streams an answer without thinking events for the minimal chat client", async () => {
  const { dispatchToLegacyApp } = await import("../smfta/server/runtime/dispatch");
  const response = await dispatchToLegacyApp(
    new Request("http://localhost:3000/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", text: "তুমি কে এবং তোমাকে কে তৈরি করেছে?" }],
        provider: "smfta_cloud",
        externalModel: "smfta-v2-pro",
        thinkingMode: "high",
        includeThinkingDetails: false,
      }),
    }),
  );
  expect(response.status).toBe(200);
  const events = await response.text();
  expect(events).toContain('"type":"text"');
  expect(events).toContain('"type":"done"');
  expect(events).not.toContain('"type":"thinking"');
});
