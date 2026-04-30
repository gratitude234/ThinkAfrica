import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

export async function POST(request: NextRequest) {
  const auth = request.headers.get("x-internal-secret");

  if (!ADMIN_SECRET || auth !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const googleTtsApiKey = process.env.GOOGLE_TTS_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!anthropicApiKey || !googleTtsApiKey || !supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Audio summary generation is not configured" },
      { status: 500 }
    );
  }

  const body = (await request.json()) as {
    postId: string;
    title: string;
    content: string;
    authorName: string;
    postType: string;
  };

  const { postId, title, content, authorName, postType } = body;
  const plainText = content
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);

  let script = "";

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
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: `You are writing a 90-second spoken audio summary for a ThinkAfrica post.
The post is a ${postType} by ${authorName}, titled: "${title}".

Write a tight, engaging spoken summary of exactly 200-240 words.
- Start with the author and title: "In this ${postType}, ${authorName} argues that..."
- Cover the 2-3 key points
- End with one sentence about why it matters for Africa today
- Use natural spoken language - no bullet points, no headers, no markdown
- Do NOT say "in conclusion" or "in summary"

The text to summarise:
${plainText}

Return ONLY the spoken script, nothing else.`,
          },
        ],
      }),
    });

    const anthropicData = (await anthropicRes.json()) as {
      content?: Array<{ type: string; text: string }>;
      error?: { message?: string };
    };

    if (!anthropicRes.ok) {
      throw new Error(anthropicData.error?.message ?? "Anthropic request failed");
    }

    script = (anthropicData.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(" ")
      .trim();
  } catch {
    return NextResponse.json(
      { error: "Anthropic script generation failed" },
      { status: 500 }
    );
  }

  if (!script) {
    return NextResponse.json({ error: "Empty script" }, { status: 500 });
  }

  let audioBuffer: Buffer;

  try {
    const ttsRes = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleTtsApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: script },
          voice: {
            languageCode: "en-GB",
            name: "en-GB-Wavenet-D",
            ssmlGender: "MALE",
          },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: 1.05,
            pitch: -1.0,
          },
        }),
      }
    );

    const ttsData = (await ttsRes.json()) as {
      audioContent?: string;
      error?: { message?: string };
    };

    if (!ttsRes.ok || !ttsData.audioContent) {
      throw new Error(ttsData.error?.message ?? "No audio content returned");
    }

    audioBuffer = Buffer.from(ttsData.audioContent, "base64");
  } catch {
    return NextResponse.json({ error: "TTS generation failed" }, { status: 500 });
  }

  const supabase = createClient(
    supabaseUrl,
    serviceRoleKey
  );

  const storagePath = `summaries/${postId}.mp3`;
  const { error: uploadError } = await supabase.storage
    .from("audio-summaries")
    .upload(storagePath, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from("audio-summaries")
    .getPublicUrl(storagePath);

  await supabase
    .from("posts")
    .update({ audio_summary_url: urlData.publicUrl })
    .eq("id", postId);

  return NextResponse.json({ url: urlData.publicUrl });
}
