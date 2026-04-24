import { NextRequest, NextResponse } from "next/server";
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

function resolveStance(argument: Pick<DebateRecapArgument, "stance" | "round_number">) {
  if (argument.stance === "for" || argument.stance === "against") {
    return argument.stance;
  }

  return (argument.round_number ?? 1) % 2 === 1 ? "for" : "against";
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("x-internal-secret");
  const adminSecret = process.env.ADMIN_SECRET;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (!adminSecret || auth !== adminSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!anthropicApiKey) {
    return NextResponse.json(
      { error: "Debate recap generation is not configured" },
      { status: 500 }
    );
  }

  const body = (await request.json()) as { debateId: string };
  const { debateId } = body;
  const supabase = createAdminClient();

  const [{ data: debate }, { data: args }] = await Promise.all([
    supabase
      .from("debates")
      .select("title, description, motion_for_count, motion_against_count")
      .eq("id", debateId)
      .single(),
    supabase
      .from("debate_arguments")
      .select(
        "content, stance, round_number, upvotes, profiles!debate_arguments_author_id_fkey(full_name, university)"
      )
      .eq("debate_id", debateId)
      .order("upvotes", { ascending: false }),
  ]);

  if (!debate || !args) {
    return NextResponse.json({ error: "Debate not found" }, { status: 404 });
  }

  const argumentsList = args as DebateRecapArgument[];
  const forArgs = argumentsList.filter((argument) => resolveStance(argument) === "for");
  const againstArgs = argumentsList.filter(
    (argument) => resolveStance(argument) === "against"
  );
  const topFor = forArgs[0];
  const topAgainst = againstArgs[0];
  const totalVotes = (debate.motion_for_count ?? 0) + (debate.motion_against_count ?? 0);
  const forPct =
    totalVotes === 0
      ? 50
      : Math.round(((debate.motion_for_count ?? 0) / totalVotes) * 100);

  const formatArg = (argument: DebateRecapArgument | undefined) => {
    if (!argument) return "No arguments submitted.";

    const profile = Array.isArray(argument.profiles)
      ? argument.profiles[0]
      : argument.profiles;

    return `"${argument.content.slice(0, 400)}" - ${
      profile?.full_name ?? "Participant"
    }`;
  };

  const prompt = `You are writing a 400-word debate recap for the ThinkAfrika intellectual platform.

Motion: "${debate.title}"
${debate.description ? `Context: ${debate.description}` : ""}

Community verdict: ${forPct}% FOR the motion (${debate.motion_for_count ?? 0} for, ${debate.motion_against_count ?? 0} against).

Strongest FOR argument (${topFor?.upvotes ?? 0} upvotes):
${formatArg(topFor)}

Strongest AGAINST argument (${topAgainst?.upvotes ?? 0} upvotes):
${formatArg(topAgainst)}

Total arguments submitted: ${argumentsList.length} (${forArgs.length} for, ${againstArgs.length} against).

Write a 380-420 word recap with:
1. One paragraph stating the motion and its relevance to Africa today.
2. One paragraph summarising the strongest FOR position.
3. One paragraph summarising the strongest AGAINST position.
4. One paragraph stating the community verdict and what it signals.

Write in clear, authoritative prose. No bullet points. No headers. No markdown.
This recap will be published as a citable record.`;

  let recap = "";

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const anthropicData = (await anthropicRes.json()) as {
      content?: Array<{ type: string; text: string }>;
      error?: { message?: string };
    };

    if (!anthropicRes.ok) {
      throw new Error(anthropicData.error?.message ?? "Anthropic request failed");
    }

    recap = (anthropicData.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(" ")
      .trim();
  } catch {
    return NextResponse.json(
      { error: "Claude generation failed" },
      { status: 500 }
    );
  }

  await supabase
    .from("debates")
    .update({
      recap_text: recap,
      recap_generated_at: new Date().toISOString(),
    })
    .eq("id", debateId);

  return NextResponse.json({ ok: true });
}
