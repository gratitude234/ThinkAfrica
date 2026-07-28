import { NextRequest, NextResponse } from "next/server";
import { parseStructuredDebateRecap } from "@/lib/debateRecap";
import { requestGeminiDebateRecap } from "@/lib/geminiDebateRecap";
import { createAdminClient } from "@/lib/supabase/admin";

interface DebateRecapProfile {
  full_name: string | null;
  university: string | null;
}

interface DebateRecapArgument {
  content: string;
  stance: "for" | "against" | null;
  round_number?: number | null;
  upvotes: number;
  profiles: DebateRecapProfile | DebateRecapProfile[] | null;
}

interface DebateRecapRow {
  title: string;
  description: string | null;
  status: string;
  current_phase: string | null;
  debate_variant: "legacy" | "v1_5" | null;
  motion_for_count: number | null;
  motion_against_count: number | null;
  recap_status: "none" | "pending" | "generating" | "ready" | "failed";
  recap_attempts: number | null;
}

const PUBLIC_RECAP_FAILURE =
  "Recap generation did not complete. Please retry.";

function resolveStance(
  argument: Pick<DebateRecapArgument, "stance" | "round_number">
) {
  if (argument.stance === "for" || argument.stance === "against") {
    return argument.stance;
  }
  return (argument.round_number ?? 1) % 2 === 1 ? "for" : "against";
}

function getProfile(argument: DebateRecapArgument) {
  return Array.isArray(argument.profiles)
    ? argument.profiles[0] ?? null
    : argument.profiles;
}

function formatArgument(
  argument: DebateRecapArgument | undefined,
  maxLength = 800
) {
  if (!argument) return "No argument submitted.";
  const profile = getProfile(argument);
  return `"${argument.content.slice(0, maxLength)}" — ${
    profile?.full_name ?? "Participant"
  } (${argument.upvotes ?? 0} argument upvotes)`;
}

function getVerdict(debate: DebateRecapRow) {
  const forCount = debate.motion_for_count ?? 0;
  const againstCount = debate.motion_against_count ?? 0;
  const totalVotes = forCount + againstCount;
  const forPct = totalVotes
    ? Math.round((forCount / totalVotes) * 100)
    : null;

  return { forCount, againstCount, totalVotes, forPct };
}

function buildLegacyPrompt(
  debate: DebateRecapRow,
  argumentsList: DebateRecapArgument[]
) {
  const forArguments = argumentsList.filter(
    (argument) => resolveStance(argument) === "for"
  );
  const againstArguments = argumentsList.filter(
    (argument) => resolveStance(argument) === "against"
  );
  const verdict = getVerdict(debate);

  return `You are writing a 400-word debate recap for the Indegenius intellectual platform.

Motion: "${debate.title}"
${debate.description ? `Context: ${debate.description}` : ""}

Community verdict: ${
    verdict.totalVotes
      ? `${verdict.forPct}% FOR the motion (${verdict.forCount} for, ${verdict.againstCount} against).`
      : "No final community votes were cast. Do not describe the result as a tie or a 50/50 verdict."
  }

Strongest FOR argument:
${formatArgument(forArguments[0], 400)}

Strongest AGAINST argument:
${formatArgument(againstArguments[0], 400)}

Total arguments submitted: ${argumentsList.length} (${forArguments.length} for, ${againstArguments.length} against).

Write a 380-420 word recap with:
1. One paragraph stating the motion and its relevance to Africa today.
2. One paragraph summarising the strongest FOR position.
3. One paragraph summarising the strongest AGAINST position.
4. One paragraph stating the community verdict and what it signals.

Write in clear, authoritative prose. No bullet points. No headers. No markdown.
The vote count alone determines the verdict. This recap only summarises the debate.`;
}

function buildStructuredPrompt(
  debate: DebateRecapRow,
  argumentsList: DebateRecapArgument[]
) {
  const forArguments = argumentsList.filter(
    (argument) => resolveStance(argument) === "for"
  );
  const againstArguments = argumentsList.filter(
    (argument) => resolveStance(argument) === "against"
  );
  const verdict = getVerdict(debate);
  const allArguments = argumentsList
    .map(
      (argument, index) =>
        `${index + 1}. ${resolveStance(argument).toUpperCase()}: ${formatArgument(
          argument
        )}`
    )
    .join("\n");

  return `Create an AI-assisted recap for a completed 1v1 debate on Indegenius.

Motion: "${debate.title}"
${debate.description ? `Context: ${debate.description}` : ""}

The community verdict is authoritative: ${
    verdict.totalVotes
      ? `${verdict.forPct}% FOR and ${100 - (verdict.forPct ?? 0)}% AGAINST (${
          verdict.totalVotes
        } final votes).`
      : "No final votes were cast. There is no community winner, tie, or percentage verdict."
  } You must not imply that the AI chose the winner. Argument upvotes identify useful arguments but do not determine the verdict.

Arguments:
${allArguments || "No arguments were submitted."}

Return ONLY valid JSON with exactly these five string fields:
{
  "recap_text": "A 280-400 word neutral narrative covering the motion, both sides, and the community vote",
  "key_disagreement": "A concise explanation of the central unresolved disagreement",
  "agreement": "A concise description of genuine common ground; if none, say so plainly",
  "strongest_for": "A concise neutral summary of the strongest FOR reasoning",
  "strongest_against": "A concise neutral summary of the strongest AGAINST reasoning"
}

Strongest FOR candidate by argument upvotes:
${formatArgument(forArguments[0])}

Strongest AGAINST candidate by argument upvotes:
${formatArgument(againstArguments[0])}

Do not include markdown fences, citations you were not given, or commentary outside the JSON.`;
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("x-internal-secret");
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || auth !== adminSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let debateId = "";
  try {
    const body = (await request.json()) as { debateId?: unknown };
    debateId = typeof body.debateId === "string" ? body.debateId.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!debateId) {
    return NextResponse.json({ error: "debateId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const [{ data: debateRaw, error: debateError }, { data: args, error: argsError }] =
    await Promise.all([
      supabase
        .from("debates")
        .select(
          "title, description, status, current_phase, debate_variant, motion_for_count, motion_against_count, recap_status, recap_attempts"
        )
        .eq("id", debateId)
        .maybeSingle(),
      supabase
        .from("debate_arguments")
        .select(
          "content, stance, round_number, upvotes, profiles!debate_arguments_author_id_fkey(full_name, university)"
        )
        .eq("debate_id", debateId)
        .order("upvotes", { ascending: false }),
    ]);

  if (debateError || argsError || !debateRaw) {
    return NextResponse.json({ error: "Debate not found" }, { status: 404 });
  }

  const debate = debateRaw as DebateRecapRow;
  const argumentsList = (args ?? []) as DebateRecapArgument[];
  const isV15 = debate.debate_variant === "v1_5";

  if (
    isV15 &&
    (debate.status !== "closed" || debate.current_phase !== "completed")
  ) {
    return NextResponse.json(
      { error: "Only a completed debate can be recapped" },
      { status: 409 }
    );
  }

  if (isV15) {
    const { data: claimed, error: claimError } = await supabase
      .from("debates")
      .update({
        recap_status: "generating",
        recap_attempts: (debate.recap_attempts ?? 0) + 1,
        recap_error: null,
      })
      .eq("id", debateId)
      .in("recap_status", ["pending", "failed"])
      .select("id")
      .maybeSingle();

    if (claimError) {
      return NextResponse.json(
        { error: "Recap generation could not be started" },
        { status: 500 }
      );
    }
    if (!claimed) {
      return NextResponse.json(
        {
          error:
            debate.recap_status === "generating"
              ? "Recap generation is already in progress"
              : "This recap is not waiting to be generated",
        },
        { status: 409 }
      );
    }
  }

  const failV15 = async () => {
    if (!isV15) return;
    await supabase
      .from("debates")
      .update({
        recap_status: "failed",
        recap_error: PUBLIC_RECAP_FAILURE,
      })
      .eq("id", debateId)
      .eq("recap_status", "generating");
  };

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error("Debate recap generation is missing GEMINI_API_KEY.");
    await failV15();
    return NextResponse.json(
      { error: "Debate recap generation is not configured" },
      { status: 500 }
    );
  }

  try {
    const generated = await requestGeminiDebateRecap({
      prompt: isV15
        ? buildStructuredPrompt(debate, argumentsList)
        : buildLegacyPrompt(debate, argumentsList),
      apiKey: geminiApiKey,
      structured: isV15,
    });

    if (isV15) {
      const recap = parseStructuredDebateRecap(generated);
      if (!recap) {
        throw new Error("Structured recap response was invalid.");
      }

      const { error: updateError } = await supabase
        .from("debates")
        .update({
          recap_text: recap.recap_text,
          recap_key_disagreement: recap.key_disagreement,
          recap_agreement: recap.agreement,
          recap_strongest_for: recap.strongest_for,
          recap_strongest_against: recap.strongest_against,
          recap_generated_at: new Date().toISOString(),
          recap_status: "ready",
          recap_error: null,
        })
        .eq("id", debateId)
        .eq("recap_status", "generating");

      if (updateError) throw updateError;
    } else {
      const { error: updateError } = await supabase
        .from("debates")
        .update({
          recap_text: generated,
          recap_generated_at: new Date().toISOString(),
        })
        .eq("id", debateId);
      if (updateError) throw updateError;
    }
  } catch (error) {
    console.error(
      `Gemini debate recap generation failed for ${debateId}: ${
        error instanceof Error ? error.message : "Unknown provider error"
      }`
    );
    await failV15();
    return NextResponse.json(
      { error: "Recap generation failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    recapStatus: isV15 ? "ready" : undefined,
    aiAssisted: isV15,
  });
}
