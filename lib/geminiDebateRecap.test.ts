import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GEMINI_RECAP_MODEL,
  requestGeminiDebateRecap,
} from "@/lib/geminiDebateRecap";

describe("Gemini debate recap request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requests schema-constrained JSON for a V1.5 recap", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: '{"recap_text":"A recap"}' }],
            },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestGeminiDebateRecap({
      prompt: "Summarise this debate.",
      apiKey: "gemini-key",
      structured: true,
    });

    expect(result).toBe('{"recap_text":"A recap"}');
    expect(fetchMock).toHaveBeenCalledWith(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_RECAP_MODEL}:generateContent`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-goog-api-key": "gemini-key",
        }),
      })
    );

    const request = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(request.body ?? "{}") as {
      generationConfig?: {
        responseFormat?: {
          text?: {
            mimeType?: string;
            schema?: { required?: string[] };
          };
        };
      };
    };
    expect(body.generationConfig?.responseFormat?.text?.mimeType).toBe(
      "application/json"
    );
    expect(body.generationConfig?.responseFormat?.text?.schema?.required).toEqual(
      [
        "recap_text",
        "key_disagreement",
        "agreement",
        "strongest_for",
        "strongest_against",
      ]
    );
  });

  it("keeps legacy recap generation as plain text", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "A plain-language legacy recap." }],
            },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await requestGeminiDebateRecap({
      prompt: "Summarise this legacy debate.",
      apiKey: "gemini-key",
      structured: false,
    });

    const request = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(request.body ?? "{}") as {
      generationConfig?: { responseFormat?: unknown };
    };
    expect(body.generationConfig?.responseFormat).toBeUndefined();
  });

  it("surfaces Gemini API errors without exposing the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          error: { message: "API key is invalid.", status: "INVALID_ARGUMENT" },
        }),
      }))
    );

    await expect(
      requestGeminiDebateRecap({
        prompt: "Summarise.",
        apiKey: "secret-key",
        structured: true,
      })
    ).rejects.toThrow("API key is invalid.");
  });

  it("reports blocked or empty responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          promptFeedback: { blockReason: "SAFETY" },
          candidates: [],
        }),
      }))
    );

    await expect(
      requestGeminiDebateRecap({
        prompt: "Summarise.",
        apiKey: "gemini-key",
        structured: true,
      })
    ).rejects.toThrow("Gemini blocked the recap request: SAFETY.");
  });

  it("allows an explicit deployment model override", async () => {
    vi.stubEnv("GEMINI_RECAP_MODEL", "gemini-custom");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "{}" }] } }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await requestGeminiDebateRecap({
      prompt: "Summarise.",
      apiKey: "gemini-key",
      structured: true,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "/models/gemini-custom:generateContent"
    );
  });
});
