"use server";

import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";
import { absoluteUrl, escapeHtml, logEmailResult, sendUserEmail } from "@/lib/email";
import { POST_POINTS, type PostType } from "@/lib/utils";

type AdminClient = Awaited<ReturnType<typeof createAdminActionClient>>["admin"];

type DigestProfileRow = {
  id: string;
  notification_prefs: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function wantsDigestEmail(prefs: unknown) {
  return !isRecord(prefs) || prefs.email_digest !== false;
}

function formatDigestDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

async function getDigestRecipientIds(admin: AdminClient) {
  const recipientIds: string[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, notification_prefs")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as DigestProfileRow[];
    recipientIds.push(
      ...rows
        .filter((profile) => wantsDigestEmail(profile.notification_prefs))
        .map((profile) => profile.id)
    );

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return recipientIds;
}

async function buildWeeklyDigest(admin: AdminClient) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: topPosts },
    { data: topDebateRaw },
    { data: openFellowships },
    { data: weeklyPostsForContrib },
  ] = await Promise.all([
    admin
      .from("posts")
      .select("id, title, slug, view_count, type, published_at, profiles!posts_author_id_fkey(full_name, username)")
      .eq("status", "published")
      .gte("published_at", weekAgo)
      .order("view_count", { ascending: false })
      .limit(5),

    admin
      .from("debates")
      .select("id, title, status, debate_arguments(count)")
      .order("created_at", { ascending: false })
      .limit(10),

    admin
      .from("fellowships")
      .select("id, title, sponsor_name, deadline")
      .eq("status", "open")
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(3),

    admin
      .from("posts")
      .select("author_id, type, profiles!posts_author_id_fkey(full_name, username)")
      .eq("status", "published")
      .gte("published_at", weekAgo),
  ]);

  const posts = (topPosts ?? []).map((post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
  }));

  const topDebate =
    (topDebateRaw ?? [])
      .map((debate) => ({
        ...debate,
        argCount: Array.isArray(debate.debate_arguments)
          ? debate.debate_arguments.length
          : (debate.debate_arguments as { count: number } | null)?.count ?? 0,
      }))
      .sort((left, right) => right.argCount - left.argCount)[0] ?? null;

  const contribMap: Record<string, { full_name: string; username: string; pts: number }> = {};
  for (const post of weeklyPostsForContrib ?? []) {
    const profile = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
    if (!profile) continue;
    if (!contribMap[post.author_id]) {
      contribMap[post.author_id] = { ...profile, pts: 0 };
    }
    contribMap[post.author_id].pts += POST_POINTS[post.type as PostType] ?? 10;
  }
  const topContrib = Object.values(contribMap).sort((a, b) => b.pts - a.pts)[0] ?? null;

  const postItems =
    posts.length > 0
      ? posts
          .map(
            (post) =>
              `<li style="margin:0 0 12px;"><a href="${escapeHtml(
                absoluteUrl(`/post/${post.slug}`)
              )}" style="color:#047857;font-weight:700;text-decoration:none;">${escapeHtml(
                post.title
              )}</a><br><span style="color:#6b7280;font-size:13px;">${escapeHtml(
                post.profiles?.full_name ?? post.profiles?.username ?? "ThinkAfrica"
              )} - ${post.view_count ?? 0} views - ${escapeHtml(
                formatDigestDate(post.published_at ?? null)
              )}</span></li>`
          )
          .join("")
      : `<li style="margin:0;color:#6b7280;">No new top posts this week.</li>`;

  const fellowshipItems =
    (openFellowships ?? []).length > 0
      ? (openFellowships ?? [])
          .map(
            (fellowship) =>
              `<li style="margin:0 0 10px;"><a href="${escapeHtml(
                absoluteUrl(`/fellowships/${fellowship.id}`)
              )}" style="color:#047857;font-weight:700;text-decoration:none;">${escapeHtml(
                fellowship.title
              )}</a>${
                fellowship.sponsor_name
                  ? `<br><span style="color:#6b7280;font-size:13px;">by ${escapeHtml(
                      fellowship.sponsor_name
                    )}</span>`
                  : ""
              }${
                fellowship.deadline
                  ? `<br><span style="color:#6b7280;font-size:13px;">Due ${escapeHtml(
                      formatDigestDate(fellowship.deadline)
                    )}</span>`
                  : ""
              }</li>`
          )
          .join("")
      : `<li style="margin:0;color:#6b7280;">No open fellowships this week.</li>`;

  const bodyHtml = `
    <h2 style="margin:20px 0 10px;font-size:16px;color:#111827;">Top posts this week</h2>
    <ul style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.6;color:#374151;">${postItems}</ul>
    <h2 style="margin:20px 0 10px;font-size:16px;color:#111827;">Top debate</h2>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#374151;">${
      topDebate
        ? `<a href="${escapeHtml(
            absoluteUrl(`/debates/${topDebate.id}`)
          )}" style="color:#047857;font-weight:700;text-decoration:none;">${escapeHtml(
            topDebate.title
          )}</a><br><span style="color:#6b7280;font-size:13px;">${topDebate.argCount} arguments - ${escapeHtml(
            topDebate.status
          )}</span>`
        : "No debates this week."
    }</p>
    <h2 style="margin:20px 0 10px;font-size:16px;color:#111827;">Open fellowships</h2>
    <ul style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.6;color:#374151;">${fellowshipItems}</ul>
    ${
      topContrib
        ? `<h2 style="margin:20px 0 10px;font-size:16px;color:#111827;">Top contributor</h2><p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#374151;"><strong>${escapeHtml(
            topContrib.full_name ?? topContrib.username
          )}</strong><br><span style="color:#6b7280;font-size:13px;">${topContrib.pts} pts this week</span></p>`
        : ""
    }
  `;

  const bodyTextLines = [
    "Top posts:",
    ...posts.map(
      (post) =>
        `- ${post.title} (${post.view_count ?? 0} views): ${absoluteUrl(`/post/${post.slug}`)}`
    ),
    "",
    topDebate
      ? `Top debate: ${topDebate.title} (${topDebate.argCount} arguments): ${absoluteUrl(`/debates/${topDebate.id}`)}`
      : "Top debate: No debates this week.",
    "",
    "Open fellowships:",
    ...(openFellowships ?? []).map(
      (fellowship) =>
        `- ${fellowship.title}: ${absoluteUrl(`/fellowships/${fellowship.id}`)}`
    ),
    topContrib ? `Top contributor: ${topContrib.full_name ?? topContrib.username}` : "",
  ].filter(Boolean);

  return { bodyHtml, bodyTextLines };
}

export async function recordDigestPreviewReviewed() {
  try {
    const { admin, context } = await createAdminActionClient("digest.manage");
    await recordAdminAuditEvent({
      admin,
      context,
      action: "digest.preview_reviewed",
      targetTable: null,
      targetId: null,
      metadata: { source: "admin_digest_button" },
    });

    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to record digest review.",
    };
  }
}

export async function sendWeeklyDigestEmails() {
  try {
    const { admin, context } = await createAdminActionClient("digest.manage");
    const recipientIds = await getDigestRecipientIds(admin);
    const digest = await buildWeeklyDigest(admin);
    const digestKey = new Date().toISOString().slice(0, 10);

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const recipientId of recipientIds) {
      const result = await sendUserEmail({
        recipientId,
        subject: "This week on ThinkAfrica",
        preview: "Top posts, debates, fellowships, and contributors from ThinkAfrica.",
        title: "This week on ThinkAfrica",
        intro:
          "Here is a short editorial digest of activity worth following across ThinkAfrica this week.",
        bodyHtml: digest.bodyHtml,
        bodyTextLines: digest.bodyTextLines,
        ctaLabel: "Open ThinkAfrica",
        ctaPath: "/",
        preferenceKey: "email_digest",
        idempotencyKey: `weekly-digest:${digestKey}:${recipientId}`,
      });

      logEmailResult(`weekly_digest:${recipientId}`, result);
      if ("ok" in result && result.ok) sent += 1;
      else if ("skipped" in result) skipped += 1;
      else failed += 1;
    }

    await recordAdminAuditEvent({
      admin,
      context,
      action: "digest.sent",
      targetTable: null,
      targetId: null,
      metadata: {
        sent,
        skipped,
        failed,
        total: recipientIds.length,
        source: "admin_digest_button",
      },
    });

    return {
      error: null,
      sent,
      skipped,
      failed,
      total: recipientIds.length,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to send weekly digest.",
      sent: 0,
      skipped: 0,
      failed: 0,
      total: 0,
    };
  }
}
