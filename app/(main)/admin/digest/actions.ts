"use server";

import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";
import { absoluteUrl, escapeHtml, logEmailResult, sendUserEmail } from "@/lib/email";
import { getPostMetadataTitle } from "@/lib/postDisplay";

type AdminClient = Awaited<ReturnType<typeof createAdminActionClient>>["admin"];

type DigestProfileRow = {
  id: string;
  notification_prefs: unknown;
  campus_cohort_memberships:
    | { cohort_id: string }[]
    | { cohort_id: string }
    | null;
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

async function getDigestRecipients(admin: AdminClient) {
  const recipients: DigestProfileRow[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, notification_prefs, campus_cohort_memberships(cohort_id)")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as DigestProfileRow[];
    recipients.push(
      ...rows
        .filter((profile) => wantsDigestEmail(profile.notification_prefs))
    );

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return recipients;
}

async function buildWeeklyDigest(admin: AdminClient) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: topPosts },
    { data: topDebateRaw },
    { data: openFellowships },
    { data: campusPromptsRaw },
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
      .from("campus_editorial_prompts")
      .select(
        "id, cohort_id, title, prompt_text, response_question, campus_cohorts!inner(status)"
      )
      .eq("active", true)
      .lte("starts_at", new Date().toISOString())
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
      .in("campus_cohorts.status", ["selected", "active"])
      .order("starts_at", { ascending: false }),

  ]);

  const campusPrompts = new Map<
    string,
    { id: string; title: string; promptText: string; responseQuestion: string | null }
  >();
  for (const prompt of campusPromptsRaw ?? []) {
    if (campusPrompts.has(prompt.cohort_id)) continue;
    campusPrompts.set(prompt.cohort_id, {
      id: prompt.id,
      title: prompt.title,
      promptText: prompt.prompt_text,
      responseQuestion: prompt.response_question,
    });
  }

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

  const postItems =
    posts.length > 0
      ? posts
          .map(
            (post) =>
              `<li style="margin:0 0 12px;"><a href="${escapeHtml(
                absoluteUrl(`/post/${post.slug}`)
              )}" style="color:#047857;font-weight:700;text-decoration:none;">${escapeHtml(
                getPostMetadataTitle(post, post.profiles)
              )}</a><br><span style="color:#6b7280;font-size:13px;">${escapeHtml(
                post.profiles?.full_name ?? post.profiles?.username ?? "Indegenius"
              )} - ${post.view_count ?? 0} views - ${escapeHtml(
                formatDigestDate(post.published_at ?? null)
              )}</span></li>`
          )
          .join("")
      : `<li style="margin:0;color:#6b7280;">No new publications this week.</li>`;

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
    <h2 style="margin:20px 0 10px;font-size:16px;color:#111827;">Publications worth reading</h2>
    <ul style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.6;color:#374151;">${postItems}</ul>
    <h2 style="margin:20px 0 10px;font-size:16px;color:#111827;">Featured debate</h2>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#374151;">${
      topDebate
        ? `<a href="${escapeHtml(
            absoluteUrl(`/debates/${topDebate.id}`)
          )}" style="color:#047857;font-weight:700;text-decoration:none;">${escapeHtml(
            topDebate.title
          )}</a><br><span style="color:#6b7280;font-size:13px;">${topDebate.argCount} arguments - ${escapeHtml(
            topDebate.status
          )}</span>`
        : "No debate to feature right now."
    }</p>
    <h2 style="margin:20px 0 10px;font-size:16px;color:#111827;">Open fellowships</h2>
    <ul style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.6;color:#374151;">${fellowshipItems}</ul>
  `;

  const bodyTextLines = [
    "Publications worth reading:",
    ...posts.map(
      (post) =>
        `- ${getPostMetadataTitle(post, post.profiles)} (${post.view_count ?? 0} views): ${absoluteUrl(`/post/${post.slug}`)}`
    ),
    "",
    topDebate
      ? `Featured debate: ${topDebate.title} (${topDebate.argCount} arguments): ${absoluteUrl(`/debates/${topDebate.id}`)}`
      : "Featured debate: No debate to feature right now.",
    "",
    "Open fellowships:",
    ...(openFellowships ?? []).map(
      (fellowship) =>
        `- ${fellowship.title}: ${absoluteUrl(`/fellowships/${fellowship.id}`)}`
    ),
  ].filter(Boolean);

  return { bodyHtml, bodyTextLines, campusPrompts };
}

function campusPromptDigest(
  prompt:
    | { id: string; title: string; promptText: string; responseQuestion: string | null }
    | null
) {
  if (!prompt) return { html: "", text: [] as string[] };
  const promptUrl = absoluteUrl(`/create/post?prompt=${encodeURIComponent(prompt.id)}`);
  return {
    html: `
      <h2 style="margin:20px 0 10px;font-size:16px;color:#111827;">Your campus prompt</h2>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#374151;"><strong>${escapeHtml(prompt.title)}</strong><br>${escapeHtml(prompt.promptText)}</p>
      ${prompt.responseQuestion ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">Response question: ${escapeHtml(prompt.responseQuestion)}</p>` : ""}
      <p style="margin:0 0 18px;"><a href="${escapeHtml(promptUrl)}" style="color:#047857;font-weight:700;text-decoration:none;">Write from this prompt</a></p>
    `,
    text: [
      "Your campus prompt:",
      `${prompt.title}: ${prompt.promptText}`,
      ...(prompt.responseQuestion ? [`Response question: ${prompt.responseQuestion}`] : []),
      promptUrl,
      "",
    ],
  };
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
    const recipients = await getDigestRecipients(admin);
    const digest = await buildWeeklyDigest(admin);
    const digestKey = new Date().toISOString().slice(0, 10);

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const memberships = Array.isArray(recipient.campus_cohort_memberships)
        ? recipient.campus_cohort_memberships
        : recipient.campus_cohort_memberships
          ? [recipient.campus_cohort_memberships]
          : [];
      const campusPrompt = memberships
        .map((membership) => digest.campusPrompts.get(membership.cohort_id))
        .find((prompt) => Boolean(prompt)) ?? null;
      const campusSection = campusPromptDigest(
        campusPrompt
      );
      const result = await sendUserEmail({
        recipientId: recipient.id,
        subject: "This week on Indegenius",
        preview: "New publications, debates, and opportunities from Indegenius.",
        title: "This week on Indegenius",
        intro:
          "Here are ideas and conversations worth returning to this week.",
        bodyHtml: `${campusSection.html}${digest.bodyHtml}`,
        bodyTextLines: [...campusSection.text, ...digest.bodyTextLines],
        ctaLabel: "Open Indegenius",
        ctaPath: "/",
        preferenceKey: "email_digest",
        idempotencyKey: `weekly-digest:${digestKey}:${recipient.id}`,
      });

      logEmailResult(`weekly_digest:${recipient.id}`, result);
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
        total: recipients.length,
        source: "admin_digest_button",
      },
    });

    return {
      error: null,
      sent,
      skipped,
      failed,
      total: recipients.length,
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
