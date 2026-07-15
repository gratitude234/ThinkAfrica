import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StatsBar from "./StatsBar";
import PostsTable from "./PostsTable";
import type { DashboardPost } from "./PostsTable";
import QualitySignals, { type DashboardQualityItem } from "./QualitySignals";
import PortfolioProgressCard, {
  type PortfolioNextAction,
  type PortfolioProgressItem,
} from "./PortfolioProgressCard";
import CollaborationDashboardCard from "@/components/collaboration/CollaborationDashboardCard";
import ActionInboxPanel from "@/components/notifications/ActionInboxPanel";
import OpportunityReadinessCard from "@/components/opportunities/OpportunityReadinessCard";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import RetentionThisWeek from "@/components/retention/RetentionThisWeek";
import TrackedActionLink from "@/components/retention/TrackedActionLink";
import EditorialTrustPanel from "@/components/editorial/EditorialTrustPanel";
import Button from "@/components/ui/Button";
import { getActivationState } from "@/lib/activation";
import { getCollaborationSuggestions } from "@/lib/collaboration";
import {
  getOpportunityShortLabel,
  getOpportunityStyle,
} from "@/lib/opportunities";
import { getOpportunityReadinessSummary } from "@/lib/opportunityReadiness";
import { getOpportunityMatchSummary } from "@/lib/opportunityMatch";
import { getRetentionSummary } from "@/lib/retention";
import { getPostQualitySummary } from "@/lib/postQuality";
import { getEditorialTrustSummary } from "@/lib/editorialTrust";
import { getActionInboxSummary } from "@/lib/actionInbox";
import { isAcademicProfileType, isProfileType } from "@/lib/profileTypes";
import { updateOpportunityInquiryStatus } from "./opportunityInquiryActions";

function WorkUnderReviewPanel({
  items,
}: {
  items: Array<{
    id: string;
    title: string;
    slug: string;
    status: string;
    type: string;
    citation_id?: string | null;
    summary: ReturnType<typeof getEditorialTrustSummary>;
  }>;
}) {
  if (items.length === 0) return null;

  const primary = items[0];
  const actionHref =
    primary.status === "pending_revision"
      ? `/edit/${primary.slug}`
      : primary.status === "published" && primary.citation_id
        ? `/publication/${primary.citation_id}`
        : `/post/${primary.slug}`;

  return (
    <div className="mb-6">
      <EditorialTrustPanel
        summary={primary.summary}
        title="Work under review"
        description={`${primary.title} is being tracked through the editorial workflow. Use this panel to see what changed and what happens next.`}
        actionHref={actionHref}
        actionSource="dashboard_editorial_trust"
        actionKey="editorial_review_status"
        compact
      />
      {items.length > 1 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.slice(1, 3).map((item) => (
            <TrackedActionLink
              key={item.id}
              href={
                item.status === "published" && item.citation_id
                  ? `/publication/${item.citation_id}`
                  : item.status === "pending_revision"
                    ? `/edit/${item.slug}`
                    : `/post/${item.slug}`
              }
              actionKey="editorial_review_status"
              label={item.summary.nextActionLabel}
              source="dashboard_editorial_trust"
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm transition-colors hover:border-emerald-200 hover:text-emerald-700"
            >
              <p className="font-semibold text-gray-900">{item.title}</p>
              <p className="mt-1 text-xs text-gray-500">
                {item.summary.currentStatusLabel} / {item.summary.nextActionLabel}
              </p>
            </TrackedActionLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OpportunityPipelinePanel({
  readiness,
  savedCount,
  applicationCount,
  strongestMatch,
}: {
  readiness: ReturnType<typeof getOpportunityReadinessSummary>;
  savedCount: number;
  applicationCount: number;
  strongestMatch: {
    id: string;
    title: string;
    sponsor_name: string | null;
    matchLabel: string;
    matchScore: number;
  } | null;
}) {
  if (!strongestMatch && savedCount === 0 && applicationCount === 0 && readiness.score >= 85) {
    return null;
  }

  const nextAction = readiness.nextAction
    ? {
        href: readiness.nextAction.actionHref,
        label: readiness.nextAction.actionLabel,
        body: readiness.nextAction.label,
        key: readiness.nextAction.key,
      }
    : strongestMatch
      ? {
          href: `/fellowships/${strongestMatch.id}`,
          label: "View best match",
          body: strongestMatch.title,
          key: "best_match",
        }
      : {
          href: "/opportunities",
          label: "Find opportunities",
          body: "Review curated openings",
          key: "browse_opportunities",
        };

  return (
    <section className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/70 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Opportunity pipeline
          </p>
          <h2 className="mt-1 text-lg font-semibold text-gray-950">
            {strongestMatch ? strongestMatch.title : "Get opportunity-ready"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-emerald-900/75">
            {strongestMatch
              ? `${strongestMatch.matchLabel} / ${strongestMatch.matchScore}% match${strongestMatch.sponsor_name ? ` from ${strongestMatch.sponsor_name}` : ""}.`
              : "Complete readiness so your profile and work can support applications."}
          </p>
        </div>
        <TrackedActionLink
          href={nextAction.href}
          actionKey={nextAction.key}
          label={nextAction.label}
          source="dashboard_opportunity_pipeline"
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
        >
          {nextAction.label}
        </TrackedActionLink>
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-white px-3 py-3">
          <p className="text-xs text-gray-500">Readiness</p>
          <p className="mt-1 font-semibold text-gray-900">{readiness.score}%</p>
        </div>
        <div className="rounded-lg bg-white px-3 py-3">
          <p className="text-xs text-gray-500">Saved</p>
          <p className="mt-1 font-semibold text-gray-900">{savedCount}</p>
        </div>
        <div className="rounded-lg bg-white px-3 py-3">
          <p className="text-xs text-gray-500">Applications</p>
          <p className="mt-1 font-semibold text-gray-900">{applicationCount}</p>
        </div>
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/dashboard");

  // Fetch all posts by this user
  const { data: postsRaw } = await supabase
    .from("posts")
    .select(
      `
      id, author_id, title, slug, content, excerpt, tags, type, status, impression_count, view_count, read_count,
      created_at, published_at, revision_due_at, citation_id, published_version_id,
      current_round, in_response_to,
      document_path, document_original_name, document_mime_type, document_size_bytes,
      post_reviews(assigned_at, submitted_at, recommendation),
      post_editor_decisions(decision, created_at),
      post_authors(user_id, accepted_at, profile:profiles!post_authors_user_id_fkey(username, full_name))
      `
    )
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });

  const postIds = (postsRaw ?? []).map((p) => p.id);

  let referenceCounts: Record<string, number> = {};
  let commentCounts: Record<string, number> = {};
  let bookmarkCounts: Record<string, number> = {};
  let responseCounts: Record<string, number> = {};
  let likeCounts: Record<string, number> = {};

  if (postIds.length > 0) {
    const [
      { data: references },
      { data: comments },
      { data: bookmarks },
      { data: responses },
      { data: likeCountRows },
    ] = await Promise.all([
      supabase.from("post_references").select("post_id").in("post_id", postIds),
      supabase.from("comments").select("post_id").in("post_id", postIds),
      supabase.from("bookmarks").select("post_id").in("post_id", postIds),
      supabase
        .from("posts")
        .select("in_response_to")
        .eq("status", "published")
        .in("in_response_to", postIds),
      supabase.from("post_like_counts").select("post_id, like_count").in("post_id", postIds),
    ]);

    referenceCounts = ((references ?? []) as Array<{ post_id: string | null }>).reduce(
      (acc, row) => {
        if (row.post_id) acc[row.post_id] = (acc[row.post_id] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    commentCounts = ((comments ?? []) as Array<{ post_id: string | null }>).reduce(
      (acc, row) => {
        if (row.post_id) acc[row.post_id] = (acc[row.post_id] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    bookmarkCounts = ((bookmarks ?? []) as Array<{ post_id: string | null }>).reduce(
      (acc, row) => {
        if (row.post_id) acc[row.post_id] = (acc[row.post_id] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    responseCounts = (
      (responses ?? []) as Array<{ in_response_to: string | null }>
    ).reduce(
      (acc, row) => {
        if (row.in_response_to) {
          acc[row.in_response_to] = (acc[row.in_response_to] ?? 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>
    );
    likeCounts = (
      (likeCountRows ?? []) as Array<{ post_id: string; like_count: number }>
    ).reduce(
      (acc, row) => {
        acc[row.post_id] = row.like_count;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  const [{ data: authorProfile }, { data: talentProfile }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "username, full_name, country, university, field_of_study, bio, interests, verified, verified_type, profile_type"
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("talent_profiles")
      .select(
        "id, open_to_opportunities, opportunity_types, cv_url, linkedin_url, skills, visibility"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const { data: opportunityInquiriesRaw } = talentProfile?.id
      ? await supabase
        .from("talent_inquiries")
        .select(
          "id, organization_name, contact_email, opportunity_type, role_title, timeline, commitment, fit_reason, message, status, read_at, created_at"
        )
        .eq("talent_id", talentProfile.id)
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] };

  const activationState = await getActivationState(supabase, user.id);
  const retentionSummary = await getRetentionSummary(
    supabase,
    user.id,
    activationState
  );

  const { data: actionNotificationsRaw } = await supabase
    .from("notifications")
    .select(
      `
      id, type, read, created_at, actor_id, post_id, message, link,
      actor:profiles!notifications_actor_id_fkey(full_name, username, avatar_url),
      post:posts!notifications_post_id_fkey(title, slug)
    `
    )
    .eq("user_id", user.id)
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(12);

  const actionNotifications = (actionNotificationsRaw ?? []).map((notification) => {
    const actor = Array.isArray(notification.actor)
      ? notification.actor[0]
      : notification.actor;
    const post = Array.isArray(notification.post)
      ? notification.post[0]
      : notification.post;

    return {
      id: notification.id,
      type: notification.type,
      read: notification.read,
      created_at: notification.created_at,
      message: notification.message ?? null,
      link: notification.link ?? null,
      post_id: notification.post_id ?? null,
      actor,
      actor_username: actor?.username ?? null,
      post_title: post?.title ?? null,
      post_slug: post?.slug ?? null,
    };
  });
  const actionInboxSummary = getActionInboxSummary(actionNotifications);

  // Fellowship applications by this user
  const { data: applicationsRaw } = await supabase
    .from("fellowship_applications")
    .select(
      "id, status, applied_at, proof_post_id, review_note, reviewed_at, fellowships(id, title, deadline, opportunity_type, application_url)"
    )
    .eq("user_id", user.id)
    .order("applied_at", { ascending: false });

  const applicationProofIds = (applicationsRaw ?? [])
    .map((application) => application.proof_post_id)
    .filter(Boolean) as string[];
  const { data: applicationProofPostsRaw } =
    applicationProofIds.length > 0
      ? await supabase
          .from("posts")
          .select("id, title, slug, type, citation_id")
          .in("id", applicationProofIds)
      : { data: [] };
  const applicationProofPosts = new Map(
    (applicationProofPostsRaw ?? []).map((post) => [post.id, post])
  );

  const [{ data: savedOpportunitiesRaw }, { data: openOpportunitiesRaw }] =
    await Promise.all([
      supabase
        .from("saved_opportunities")
        .select("fellowship_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("fellowships")
        .select(
          "id, title, sponsor_name, eligibility, deadline, opportunity_type, skills, location, featured"
        )
        .eq("status", "open")
        .order("featured", { ascending: false })
        .order("deadline", { ascending: true, nullsFirst: false })
        .limit(12),
    ]);

  const applications = (applicationsRaw ?? []).map((a) => ({
    ...a,
    fellowship: Array.isArray(a.fellowships) ? a.fellowships[0] : a.fellowships,
    proofPost: a.proof_post_id
      ? applicationProofPosts.get(a.proof_post_id) ?? null
      : null,
  }));

  const collaborationTags = Array.from(
    new Set((postsRaw ?? []).flatMap((post) => post.tags ?? []))
  ).slice(0, 8);
  const [
    { data: pendingInvitesRaw },
    { data: recentResponsesRaw },
    { data: conversationParticipantsRaw },
    collaborationSuggestions,
  ] = await Promise.all([
    supabase
      .from("post_authors")
      .select(
        "post_id, invited_at, posts!post_authors_post_id_fkey(id, title, slug, profiles!posts_author_id_fkey(full_name, username))"
      )
      .eq("user_id", user.id)
      .is("accepted_at", null)
      .order("invited_at", { ascending: false })
      .limit(3),
    postIds.length > 0
      ? supabase
          .from("posts")
          .select(
            "id, title, slug, in_response_to, published_at, profiles!posts_author_id_fkey(username, full_name, avatar_url)"
          )
          .eq("status", "published")
          .neq("author_id", user.id)
          .in("in_response_to", postIds)
          .order("published_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),
    supabase
      .from("conversation_participants")
      .select("last_read_at, conversations!inner(last_message_at)")
      .eq("user_id", user.id),
    getCollaborationSuggestions(supabase, {
      currentUserId: user.id,
      university: authorProfile?.university ?? null,
      fieldOfStudy: authorProfile?.field_of_study ?? null,
      tags: collaborationTags,
      limit: 3,
    }),
  ]);

  const pendingInvites = (pendingInvitesRaw ?? []).map((invite) => {
    const post = Array.isArray(invite.posts) ? invite.posts[0] : invite.posts;
    const authorProfile = Array.isArray(post?.profiles)
      ? post?.profiles[0]
      : post?.profiles;

    return {
      postId: invite.post_id,
      title: post?.title ?? "Untitled collaboration",
      slug: post?.slug ?? "",
      authorName:
        authorProfile?.full_name ?? authorProfile?.username ?? "An Indegenius author",
    };
  });

  const recentResponses = (recentResponsesRaw ?? []).map((response) => {
    const profile = Array.isArray(response.profiles)
      ? response.profiles[0]
      : response.profiles;

    return {
      id: response.id,
      title: response.title,
      slug: response.slug,
      authorName: profile?.full_name ?? profile?.username ?? "Indegenius writer",
      avatarUrl: profile?.avatar_url ?? null,
    };
  });

  const unreadMessageCount = ((conversationParticipantsRaw ?? []) as Array<{
    last_read_at: string;
    conversations:
      | { last_message_at: string }
      | { last_message_at: string }[]
      | null;
  }>).filter((row) => {
    const conversation = Array.isArray(row.conversations)
      ? row.conversations[0]
      : row.conversations;

    return (
      !!conversation &&
      new Date(conversation.last_message_at).getTime() >
        new Date(row.last_read_at).getTime()
    );
  }).length;

  const pendingQueue = [...(postsRaw ?? [])]
    .filter((post) => post.status === "pending")
    .sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    );
  const queuePositionById = new Map(
    pendingQueue.map((post, index) => [post.id, index + 1])
  );

  const posts: DashboardPost[] = (postsRaw ?? []).map((p) => ({
    ...p,
    impression_count: (p as { impression_count?: number | null }).impression_count ?? 0,
    view_count: p.view_count ?? 0,
    read_count: (p as { read_count?: number | null }).read_count ?? 0,
    like_count: likeCounts[p.id] ?? 0,
    revision_due_at: p.revision_due_at ?? null,
    citation_id: (p as { citation_id?: string | null }).citation_id ?? null,
    published_version_id:
      (p as { published_version_id?: string | null }).published_version_id ?? null,
    current_round: (p as { current_round?: number | null }).current_round ?? 1,
    document_path: (p as { document_path?: string | null }).document_path ?? null,
    document_original_name:
      (p as { document_original_name?: string | null }).document_original_name ?? null,
    document_mime_type:
      (p as { document_mime_type?: string | null }).document_mime_type ?? null,
    document_size_bytes:
      (p as { document_size_bytes?: number | null }).document_size_bytes ?? null,
    post_reviews: p.post_reviews ?? [],
    post_editor_decisions: p.post_editor_decisions ?? [],
    co_authors: Array.isArray((p as { post_authors?: unknown[] }).post_authors)
      ? ((p as { post_authors?: Array<Record<string, unknown>> }).post_authors ?? [])
          .filter((row) => row.accepted_at)
          .filter((row) => row.user_id !== user.id)
          .map((row) => ({
            user_id: row.user_id as string,
            profile: Array.isArray(row.profile)
              ? (row.profile[0] as { username: string; full_name: string | null })
              : (row.profile as { username: string; full_name: string | null } | null),
          }))
      : [],
    queuePosition: queuePositionById.get(p.id) ?? null,
  }));

  const qualityItems: DashboardQualityItem[] = (postsRaw ?? [])
    .map((post) => {
      const reviews = post.post_reviews ?? [];
      const summary = getPostQualitySummary({
        type: post.type,
        status: post.status,
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        tags: post.tags ?? [],
        citationId: (post as { citation_id?: string | null }).citation_id ?? null,
        isResponse: Boolean(
          (post as { in_response_to?: string | null }).in_response_to
        ),
        author: authorProfile,
        referenceCount: referenceCounts[post.id] ?? 0,
        responseCount: responseCounts[post.id] ?? 0,
        reviewCount: reviews.length,
        completedReviewCount: reviews.filter((review) => review.submitted_at).length,
        commentCount: commentCounts[post.id] ?? 0,
        likeCount: likeCounts[post.id] ?? 0,
        bookmarkCount: bookmarkCounts[post.id] ?? 0,
      });

      return {
        id: post.id,
        title: post.title,
        status: post.status,
        actionHref:
          post.type === "research" &&
          (post.status === "draft" || post.status === "pending_revision")
            ? `/submit/research?draft=${post.id}`
            : post.status === "draft"
              ? `/write?draft=${post.id}`
              : `/edit/${post.slug}`,
        actionLabel:
          post.status === "pending_revision"
            ? "Review notes"
            : post.status === "draft"
              ? "Continue"
              : "Improve",
        summary,
      };
    })
    .filter(
      (item) =>
        item.status === "pending_revision" ||
        item.status === "draft" ||
        item.summary.missingItems.length > 0 ||
        item.summary.wordCount > 0
    )
    .sort((left, right) => {
      const priority = (item: DashboardQualityItem) => {
        if (item.status === "pending_revision") return 0;
        if (!item.summary.readyForSubmission) return 1;
        if (item.status === "draft") return 2;
        return 3;
      };

      return priority(left) - priority(right);
    })
    .slice(0, 4);

  const revisionPosts = posts.filter((post) => post.status === "pending_revision");
  const publishedPosts = posts.filter((p) => p.status === "published");
  const profileHref = authorProfile?.username
    ? `/${authorProfile.username}`
    : "/settings";
  const authorIsAcademic = isProfileType(authorProfile?.profile_type)
    ? isAcademicProfileType(authorProfile.profile_type)
    : false;
  const profileBasicsComplete = Boolean(
    authorProfile?.username &&
      authorProfile?.full_name &&
      (authorIsAcademic ? authorProfile?.university : true)
  );
  const reviewedOrCitableCount = publishedPosts.filter(
    (post) =>
      post.citation_id ||
      post.type === "research" ||
      post.type === "policy_brief"
  ).length;
  const coAuthoredCount = posts.filter(
    (post) => (post.co_authors ?? []).length > 0
  ).length;
  const sourceBackedCount = posts.filter(
    (post) => (referenceCounts[post.id] ?? 0) > 0
  ).length;
  const totalViews = publishedPosts.reduce((sum, p) => sum + p.view_count, 0);
  const totalImpressions = publishedPosts.reduce(
    (sum, p) => sum + p.impression_count,
    0
  );
  const totalReads = publishedPosts.reduce((sum, p) => sum + p.read_count, 0);
  const opportunityReadiness = getOpportunityReadinessSummary({
    profile: authorProfile,
    talentProfile,
    posts: (postsRaw ?? []).map((post) => ({
      type: post.type,
      status: post.status,
      citation_id: (post as { citation_id?: string | null }).citation_id ?? null,
      referenceCount: referenceCounts[post.id] ?? 0,
    })),
  });
  const opportunityMatchPosts = (postsRaw ?? []).map((post) => ({
    type: post.type,
    status: post.status,
    citation_id: (post as { citation_id?: string | null }).citation_id ?? null,
    tags: post.tags ?? [],
    referenceCount: referenceCounts[post.id] ?? 0,
  }));
  const strongestOpportunityMatch = (openOpportunitiesRaw ?? [])
    .map((opportunity) => ({
      id: opportunity.id,
      title: opportunity.title,
      sponsor_name: opportunity.sponsor_name ?? null,
      summary: getOpportunityMatchSummary({
        opportunity,
        profile: authorProfile,
        talentProfile,
        posts: opportunityMatchPosts,
      }),
    }))
    .sort((left, right) => right.summary.score - left.summary.score)[0];
  const reviewedDraftMissingReferences = posts.find(
    (post) =>
      post.status === "draft" &&
      (post.type === "research" || post.type === "policy_brief") &&
      (referenceCounts[post.id] ?? 0) === 0
  );
  const reviewedDraftReady = posts.find(
    (post) =>
      post.status === "draft" &&
      (post.type === "research" || post.type === "policy_brief") &&
      (referenceCounts[post.id] ?? 0) > 0
  );
  const citablePost = publishedPosts.find((post) => post.citation_id);
  const recentReviewedCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const workUnderReviewItems = posts
    .filter((post) => post.type === "research" || post.type === "policy_brief")
    .filter((post) => {
      if (post.status === "pending" || post.status === "pending_revision") return true;
      if (post.status !== "published") return false;
      const publishedAt = post.published_at ? new Date(post.published_at).getTime() : 0;
      return publishedAt >= recentReviewedCutoff;
    })
    .map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      status: post.status,
      type: post.type,
      citation_id: post.citation_id ?? null,
      summary: getEditorialTrustSummary({
        type: post.type,
        status: post.status,
        currentRound: post.current_round ?? 1,
        createdAt: post.created_at,
        publishedAt: post.published_at,
        revisionDueAt: post.revision_due_at ?? null,
        citationId: post.citation_id ?? null,
        publishedVersionId: post.published_version_id ?? null,
        referenceCount: referenceCounts[post.id] ?? 0,
        reviews: post.post_reviews ?? [],
        decisions: post.post_editor_decisions ?? [],
      }),
    }))
    .sort((left, right) => {
      const priority = (status: string) =>
        status === "pending_revision" ? 0 : status === "pending" ? 1 : 2;
      return priority(left.status) - priority(right.status);
    });
  const portfolioItems: PortfolioProgressItem[] = [
    {
      key: "published",
      label: "Published",
      value: publishedPosts.length,
      helper: "Public work visible on your profile.",
      done: publishedPosts.length > 0,
    },
    {
      key: "reviewed",
      label: "Reviewed/citable",
      value: reviewedOrCitableCount,
      helper: "Research, policy, or archived work.",
      done: reviewedOrCitableCount > 0,
    },
    {
      key: "coauthored",
      label: "Co-authored",
      value: coAuthoredCount,
      helper: "Accepted shared authorship.",
      done: coAuthoredCount > 0,
    },
    {
      key: "source_backed",
      label: "Source-backed",
      value: sourceBackedCount,
      helper: "Work with structured references.",
      done: sourceBackedCount > 0,
    },
    {
      key: "opportunities",
      label: "Opportunity ready",
      value: opportunityReadiness.score,
      target: 100,
      helper: "Profile setup for selectors.",
      done: opportunityReadiness.score >= 100,
    },
  ];
  const portfolioNextAction: PortfolioNextAction = !profileBasicsComplete
    ? {
        label: "Complete your profile basics",
        body: authorIsAcademic
          ? "Add your name, username, and university so every publication has a credible author line."
          : "Add your name and username so every publication has a credible author line.",
        href: "/settings",
        cta: "Complete profile",
      }
    : publishedPosts.length === 0
      ? {
          label: "Publish your first portfolio piece",
          body: "Start with a Quick Take or Essay, then build toward reviewed formats.",
          href: "/write",
          cta: "Start writing",
        }
      : reviewedDraftMissingReferences
        ? {
            label: "Add references to reviewed-format draft",
            body: "Research and policy briefs need sources before they can enter review.",
            href: `/write?draft=${reviewedDraftMissingReferences.id}`,
            cta: "Add sources",
          }
        : reviewedDraftReady
          ? {
              label: "Submit reviewed work",
              body: "Your reviewed-format draft has sources. Open publish review to submit it.",
              href: `/write?draft=${reviewedDraftReady.id}`,
              cta: "Continue draft",
            }
          : citablePost
            ? {
                label: "Feature your citable work",
                body: "Put your strongest archived or citable piece near the top of your profile.",
                href: profileHref,
                cta: "Manage profile",
              }
            : opportunityReadiness.nextAction
              ? {
                  label: opportunityReadiness.nextAction.label,
                  body: "Finish opportunity readiness so selectors know what you are open to.",
                  href: opportunityReadiness.nextAction.actionHref,
                  cta: opportunityReadiness.nextAction.actionLabel,
                }
              : {
                  label: "Keep building portfolio proof",
                  body: "Add another source-backed or co-authored piece to make your record stronger.",
                  href: "/write",
                  cta: "Write next piece",
                };
  const opportunityInquiries = opportunityInquiriesRaw ?? [];

  return (
    <div className="max-w-5xl mx-auto">
      <RetentionEventTracker
        event="dashboard_viewed"
        metadata={{
          activated: activationState.activated,
          publishedCount: publishedPosts.length,
        }}
      />

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage your posts and track your performance.
          </p>
        </div>
        <Link href="/write">
          <Button>+ New post</Button>
        </Link>
      </div>

      {activationState.activated ? (
        <RetentionThisWeek summary={retentionSummary} source="dashboard" />
      ) : null}

      <WorkUnderReviewPanel items={workUnderReviewItems} />

      <ActionInboxPanel
        summary={actionInboxSummary}
        source="dashboard_action_inbox"
        compact
      />

      <PortfolioProgressCard
        items={portfolioItems}
        nextAction={portfolioNextAction}
      />

      <CollaborationDashboardCard
        pendingInvites={pendingInvites}
        recentResponses={recentResponses}
        unreadMessageCount={unreadMessageCount}
        suggestions={collaborationSuggestions}
      />

      <RetentionEventTracker
        event="opportunity_readiness_viewed"
        metadata={{ source: "dashboard", score: opportunityReadiness.score }}
      />
      <OpportunityReadinessCard
        summary={opportunityReadiness}
        source="dashboard"
      />

      <OpportunityPipelinePanel
        readiness={opportunityReadiness}
        savedCount={(savedOpportunitiesRaw ?? []).length}
        applicationCount={applications.length}
        strongestMatch={
          strongestOpportunityMatch
            ? {
                id: strongestOpportunityMatch.id,
                title: strongestOpportunityMatch.title,
                sponsor_name: strongestOpportunityMatch.sponsor_name,
                matchLabel: strongestOpportunityMatch.summary.label,
                matchScore: strongestOpportunityMatch.summary.score,
              }
            : null
        }
      />

      {revisionPosts.length > 0 ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            Reviewer feedback received
          </h2>
          <div className="mt-3 space-y-2">
            {revisionPosts.map((post) => (
              <Link
                key={post.id}
                href={`/edit/${post.slug}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm text-gray-700 transition-colors hover:bg-amber-100/40"
              >
                <span className="font-medium text-gray-900">{post.title}</span>
                <span className="text-right text-xs font-medium text-amber-700">
                  {post.revision_due_at
                    ? `Revise by ${new Date(post.revision_due_at).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        }
                      )}`
                    : "Revise now"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <QualitySignals items={qualityItems} />

      <StatsBar
        totalImpressions={totalImpressions}
        totalViews={totalViews}
        totalReads={totalReads}
        publishedCount={publishedPosts.length}
        reviewedCount={reviewedOrCitableCount}
        sourceBackedCount={sourceBackedCount}
      />

      <PostsTable posts={posts} userId={user.id} />

      {opportunityInquiries.length > 0 ? (
        <div id="opportunity-interest" className="mt-10 scroll-mt-24">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Opportunity interest
          </h2>
          <div className="space-y-3">
            {opportunityInquiries.map((inquiry) => (
              <div
                key={inquiry.id}
                className={`rounded-xl border bg-white p-4 ${
                  inquiry.status === "new"
                    ? "border-emerald-200 shadow-sm"
                    : "border-gray-200"
                }`}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">
                        {inquiry.role_title ?? "Opportunity inquiry"}
                      </p>
                      {inquiry.status === "new" ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          New
                        </span>
                      ) : null}
                      {inquiry.opportunity_type ? (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getOpportunityStyle(
                            inquiry.opportunity_type
                          )}`}
                        >
                          {getOpportunityShortLabel(inquiry.opportunity_type)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {inquiry.organization_name ?? "Organization not listed"} /{" "}
                      {inquiry.contact_email ?? "No reply email provided"}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(inquiry.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {inquiry.timeline ? (
                    <div className="rounded-lg bg-canvas px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Timeline
                      </p>
                      <p className="mt-1 text-sm text-gray-700">{inquiry.timeline}</p>
                    </div>
                  ) : null}
                  {inquiry.commitment ? (
                    <div className="rounded-lg bg-canvas px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        Commitment
                      </p>
                      <p className="mt-1 text-sm text-gray-700">{inquiry.commitment}</p>
                    </div>
                  ) : null}
                  <div className="rounded-lg bg-canvas px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Next action
                    </p>
                    <p className="mt-1 text-sm text-gray-700">
                      Reply by email if relevant, or archive it after review.
                    </p>
                  </div>
                </div>
                {inquiry.fit_reason ? (
                  <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                      Why they think you fit
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-sky-900">
                      {inquiry.fit_reason}
                    </p>
                  </div>
                ) : null}
                {inquiry.message ? (
                  <div className="mt-3 rounded-lg border border-gray-100 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Message
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">
                      {inquiry.message}
                    </p>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {inquiry.contact_email ? (
                    <TrackedActionLink
                      href={`mailto:${inquiry.contact_email}`}
                      actionKey="reply_opportunity_inquiry"
                      label="Reply by email"
                      source="dashboard_opportunity_interest"
                      className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-800"
                    >
                      Reply by email
                    </TrackedActionLink>
                  ) : null}
                  <TrackedActionLink
                    href="/opportunities#opportunity-profile"
                    actionKey="review_opportunity_profile"
                    label="Review profile visibility"
                    source="dashboard_opportunity_interest"
                    className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-emerald-300 hover:text-emerald-700"
                  >
                    Review profile visibility
                  </TrackedActionLink>
                  {inquiry.status === "new" ? (
                    <form action={updateOpportunityInquiryStatus}>
                      <input type="hidden" name="inquiryId" value={inquiry.id} />
                      <input type="hidden" name="status" value="read" />
                      <button
                        type="submit"
                        className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-emerald-300 hover:text-emerald-700"
                      >
                        Mark read
                      </button>
                    </form>
                  ) : null}
                  <form action={updateOpportunityInquiryStatus}>
                    <input type="hidden" name="inquiryId" value={inquiry.id} />
                    <input type="hidden" name="status" value="archived" />
                    <button
                      type="submit"
                      className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
                    >
                      Archive
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {applications.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Opportunity applications
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-canvas">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Opportunity
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Applied
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {applications.map((app) => {
                  const statusStyles: Record<string, string> = {
                    pending: "bg-amber-50 text-amber-700 border-amber-200",
                    shortlisted: "bg-blue-50 text-blue-700 border-blue-200",
                    accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    rejected: "bg-red-50 text-red-600 border-red-200",
                  };
                  const nextAction =
                    app.status === "pending"
                      ? {
                          href: opportunityReadiness.nextAction?.actionHref ?? "/opportunities",
                          label:
                            opportunityReadiness.nextAction?.actionLabel ??
                            "Find another match",
                          helper: "Keep your profile and proof current while it is reviewed.",
                        }
                      : app.status === "shortlisted"
                        ? {
                            href: app.proofPost
                              ? `/post/${app.proofPost.slug}`
                              : profileHref,
                            label: app.proofPost ? "Review proof" : "Review profile",
                            helper: "You are in the candidate set.",
                          }
                        : app.status === "accepted"
                          ? {
                              href:
                                app.fellowship?.application_url ??
                                `/fellowships/${app.fellowship?.id}`,
                              label: app.fellowship?.application_url
                                ? "Open external link"
                                : "Open opportunity",
                              helper: "Follow the opportunity instructions.",
                            }
                          : {
                              href: "/opportunities",
                              label: "Apply to another match",
                              helper: "Use your proof on the next fit.",
                            };
                  return (
                    <tr key={app.id} className="hover:bg-canvas transition-colors">
                      <td className="px-4 py-3">
                        {app.fellowship ? (
                          <Link
                            href={`/fellowships/${app.fellowship.id}`}
                            className="font-medium text-gray-900 hover:text-emerald-brand transition-colors"
                          >
                            {app.fellowship.title}
                          </Link>
                        ) : (
                          <span className="text-gray-500">No fellowship found</span>
                        )}
                        {app.proofPost ? (
                          <Link
                            href={`/post/${app.proofPost.slug}`}
                            className="mt-1 block text-xs font-medium text-emerald-700 hover:text-emerald-800"
                          >
                            Proof: {app.proofPost.title}
                          </Link>
                        ) : null}
                        <p className="mt-1 text-xs text-gray-500">
                          {nextAction.helper}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(app.applied_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            statusStyles[app.status] ??
                            "bg-canvas text-gray-600 border-gray-200"
                          }`}
                        >
                          {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                        </span>
                        <Link
                          href={nextAction.href}
                          className="mt-2 block text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                          {nextAction.label}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
