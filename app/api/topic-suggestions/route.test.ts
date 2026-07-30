import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requestGeminiTopicSuggestions } from "@/lib/geminiTopicSuggestions";
import { recordActivationEvent } from "@/lib/activationServer";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/geminiTopicSuggestions", () => ({
  requestGeminiTopicSuggestions: vi.fn(),
}));
vi.mock("@/lib/activationServer", () => ({
  recordActivationEvent: vi.fn(async () => undefined),
}));

const mockedCreateClient = vi.mocked(createClient);
const mockedGemini = vi.mocked(requestGeminiTopicSuggestions);
const mockedRecordEvent = vi.mocked(recordActivationEvent);

function request(body: unknown) {
  return new Request("http://localhost/api/topic-suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function client({
  userId = "writer-1",
  quota = [{ allowed: true, remaining: 19, reset_at: "2026-07-31T00:00:00Z" }],
  quotaError = null,
}: {
  userId?: string | null;
  quota?: unknown;
  quotaError?: unknown;
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: quota, error: quotaError }),
    from: vi.fn(),
  };
}

describe("POST /api/topic-suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED", "1");
    vi.stubEnv("GEMINI_API_KEY", "gemini-secret");
    mockedGemini.mockResolvedValue(["Technology", "Innovation"]);
  });

  it("requires the release flag and authentication", async () => {
    vi.stubEnv("NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED", "0");
    let response = await POST(
      request({ contentKind: "post", body: "A sufficiently long post body." })
    );
    expect(response.status).toBe(404);
    expect(mockedCreateClient).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED", "1");
    mockedCreateClient.mockResolvedValue(client({ userId: null }) as never);
    response = await POST(
      request({ contentKind: "post", body: "A sufficiently long post body." })
    );
    expect(response.status).toBe(401);
  });

  it("validates input before claiming quota", async () => {
    const supabase = client();
    mockedCreateClient.mockResolvedValue(supabase as never);

    const response = await POST(
      request({ contentKind: "post", body: "Tiny" })
    );

    expect(response.status).toBe(400);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(mockedGemini).not.toHaveBeenCalled();
  });

  it("claims quota, calls Gemini once, and returns remaining allowance", async () => {
    const supabase = client();
    mockedCreateClient.mockResolvedValue(supabase as never);

    const response = await POST(
      request({
        contentKind: "article",
        title: "Technology and universities",
        content: "<p>A sufficiently detailed discussion of student innovation.</p>",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      suggestions: ["Technology", "Innovation"],
      remaining: 19,
      resetAt: "2026-07-31T00:00:00Z",
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "claim_ai_topic_suggestion_quota"
    );
    expect(mockedGemini).toHaveBeenCalledWith(
      expect.objectContaining({
        contentKind: "article",
        apiKey: "gemini-secret",
      })
    );
    expect(mockedRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ai_topic_suggestion_succeeded",
        metadata: { contentKind: "article", suggestionCount: 2 },
      })
    );
  });

  it("returns 429 without calling Gemini when the daily quota is exhausted", async () => {
    const supabase = client({
      quota: [
        {
          allowed: false,
          remaining: 0,
          reset_at: "2026-07-31T00:00:00Z",
        },
      ],
    });
    mockedCreateClient.mockResolvedValue(supabase as never);

    const response = await POST(
      request({ contentKind: "post", body: "A sufficiently long post body." })
    );

    expect(response.status).toBe(429);
    expect(mockedGemini).not.toHaveBeenCalled();
  });

  it("counts a provider attempt but returns only a generic failure", async () => {
    const supabase = client();
    mockedCreateClient.mockResolvedValue(supabase as never);
    mockedGemini.mockRejectedValue(
      new Error("provider details that must not reach the writer")
    );

    const response = await POST(
      request({
        contentKind: "research",
        title: "Public health study",
        abstract: "A long enough abstract about community health systems.",
        keywords: ["health systems"],
      })
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe("AI topic suggestions are temporarily unavailable.");
    expect(JSON.stringify(body)).not.toContain("provider details");
    expect(supabase.rpc).toHaveBeenCalledOnce();
    expect(mockedRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "ai_topic_suggestion_failed" })
    );
  });
});
