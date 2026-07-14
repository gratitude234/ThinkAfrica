import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDailyBriefContent } from "@/lib/dailyBrief";
import { broadcastPushNotification, getDailyBriefPushRecipients } from "@/lib/push";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dryRun =
    request.nextUrl.searchParams.get("dryRun") === "1" ||
    process.env.DAILY_BRIEF_DRY_RUN === "1";

  const admin = createAdminClient();
  const content = await getDailyBriefContent(admin);

  if (!content.featuredPost && !content.activeDebate) {
    return NextResponse.json({ skipped: "no_content", dryRun });
  }

  const bodyParts: string[] = [];
  if (content.featuredPost) bodyParts.push(`Top post: ${content.featuredPost.title}`);
  if (content.activeDebate) bodyParts.push(`Live debate: ${content.activeDebate.title}`);

  const title = "Today's brief on Indegenius";
  const body = bodyParts.join(" · ");

  const recipientIds = await getDailyBriefPushRecipients(admin);

  if (dryRun) {
    console.info(
      `[daily-brief] dry run: ${recipientIds.length} recipients, title=${JSON.stringify(
        title
      )}, body=${JSON.stringify(body)}`
    );
    return NextResponse.json({
      dryRun: true,
      recipientCount: recipientIds.length,
      title,
      body,
    });
  }

  const result = await broadcastPushNotification({
    recipientIds,
    title,
    body,
    path: "/",
    preferenceKey: "push_daily_brief",
  });

  return NextResponse.json({ dryRun: false, ...result });
}
