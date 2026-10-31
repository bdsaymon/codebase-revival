import { describe, expect, it } from "vitest";
import { resolvePublicOrigin } from "@/smfta/server/runtime/dispatch";

describe("resolvePublicOrigin", () => {
  const internal = new URL("http://localhost:8080/api/oauth/config-status");

  it("uses the browser's page address instead of localhost", () => {
    const o = resolvePublicOrigin(internal, { referer: "https://app.example.org/settings" });
    expect(o.origin).toBe("https://app.example.org");
  });

  it("prefers the forwarded host from the hosting proxy", () => {
    const o = resolvePublicOrigin(internal, {
      "x-forwarded-host": "smfta.lovable.app",
      "x-forwarded-proto": "https",
      referer: "https://other.example.org/",
    });
    expect(o.origin).toBe("https://smfta.lovable.app");
  });

  it("ignores localhost referers", () => {
    const o = resolvePublicOrigin(new URL("https://real.example.org/api/x"), {
      referer: "http://localhost:3000/",
    });
    expect(o.origin).toBe("https://real.example.org");
  });
});
