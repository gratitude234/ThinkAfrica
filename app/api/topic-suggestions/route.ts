import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAiTopicSuggestionsEnabled } from "@/lib/featureFlags";
import { requestGeminiTopicSuggestions } from "@/lib/geminiTopicSuggestions";
import { recordActivationEvent } from "@/lib/activationServer";
import {
  parseTopicSuggestionRequest,
  type TopicSuggestionResponse,
} from "@/lib/topicSuggestions";

type QuotaRow = {
  allowed: boolean;
  remaining: number;
  reset_at: string;
};

function readQuotaRow(value: unknown): QuotaRow | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (
    !row ||
    typeof row !== "object" ||
    typeof (row as QuotaRow).allowed !== "boolean" ||
    typeof (row as QuotaRow).remaining !== "number" ||
    typeof (row as QuotaRow).reset_at !== "string"
  ) {
    return null;
  }
  return row as QuotaRow;
}

export async function POST(request: Request) {
  if (!isAiTopicSuggestionsEnabled()) {
    return NextResponse.json(
      { error: "AI topic suggestions are not enabled." },
      { status: 404 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to suggest topics." }, { status: 401 });
  }

  const parsed = parseTopicSuggestionRequest(
    await request.json().catch(() => null)
  );
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[topic-suggestions] GEMINI_API_KEY is not configured");
    return NextResponse.json(
      { error: "AI topic suggestions are temporarily unavailable." },
      { status: 503 }
    );
  }

  const { data: quotaData, error: quotaError } = await supabase.rpc(
    "claim_ai_topic_suggestion_quota"
  );
  const quota = readQuotaRow(quotaData);
  if (quotaError || !quota) {
    console.error("[topic-suggestions] quota claim failed");
    return NextResponse.json(
      { error: "AI topic suggestions are temporarily unavailable." },
      { status: 503 }
    );
  }
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: "You have used today’s AI topic suggestions.",
        remaining: 0,
        resetAt: quota.reset_at,
      },
      { status: 429 }
    );
  }

  await recordActivationEvent({
    supabase,
    event: "ai_topic_suggestion_requested",
    userId: user.id,
    metadata: { contentKind: parsed.request.contentKind },
    source: "server",
    route: "/api/topic-suggestions",
  });

  try {
    const suggestions = await requestGeminiTopicSuggestions({
      contentKind: parsed.request.contentKind,
      sourceText: parsed.sourceText,
      apiKey,
    });

    await recordActivationEvent({
      supabase,
      event: "ai_topic_suggestion_succeeded",
      userId: user.id,
      metadata: {
        contentKind: parsed.request.contentKind,
        suggestionCount: suggestions.length,
      },
      source: "server",
      route: "/api/topic-suggestions",
    });

    const response: TopicSuggestionResponse = {
      suggestions,
      remaining: quota.remaining,
      resetAt: quota.reset_at,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error(
      "[topic-suggestions] Gemini request failed",
      error instanceof Error ? error.message : "Unknown provider error"
    );
    await recordActivationEvent({
      supabase,
      event: "ai_topic_suggestion_failed",
      userId: user.id,
      metadata: { contentKind: parsed.request.contentKind },
      source: "server",
      route: "/api/topic-suggestions",
    });
    return NextResponse.json(
      { error: "AI topic suggestions are temporarily unavailable." },
      { status: 502 }
    );
  }
}
