import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminActionClient } from "@/lib/adminAccess";
import { AdminAccessError, createAdminClient } from "@/lib/supabase/admin";
import { REPORT_REASONS } from "@/components/moderation/reportReasons";
import { formatDate } from "@/lib/utils";
import ModerationActions from "./ModerationActions";

const STATUS_FILTERS = ["pending", "resolved", "dismissed", "all"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600 border border-amber-200",
  resolved: "bg-emerald-50 text-emerald-600 border border-emerald-200",
  dismissed: "bg-gray-100 text-gray-500 border border-gray-200",
};

const REASON_LABELS = Object.fromEntries(
  REPORT_REASONS.map((reason) => [reason.value, reason.label])
);

type ReportRow = {
  id: string;
  reporter_id: string;
  target_type: "post" | "comment" | "user";
  target_post_id: string | null;
  target_comment_id: string | null;
  target_user_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_action: string | null;
  created_at: string;
};

type PostRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  author_id: string;
};

type CommentRow = {
  id: string;
  content: string;
  post_id: string;
  author_id: string;
  hidden_at: string | null;
};

type ProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  role: string;
  suspended_at: string | null;
};

function getStatusFilter(value: string | undefined): StatusFilter {
  return STATUS_FILTERS.includes(value as StatusFilter)
    ? (value as StatusFilter)
    : "pending";
}

function profileName(profile: ProfileRow | undefined | null) {
  return profile?.full_name?.trim() || profile?.username?.trim() || "Unknown member";
}

function commentExcerpt(content: string, maxLength = 220) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

export default async function AdminModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  let supabase: ReturnType<typeof createAdminClient> | null = null;
  try {
    const result = await createAdminActionClient("moderation.manage");
    supabase = result.admin;
  } catch (error) {
    if (error instanceof AdminAccessError && error.status === 401) redirect("/login");
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <p className="text-gray-500">You don&apos;t have access to this page.</p>
      </div>
    );
  }

  const { status: statusParam } = await searchParams;
  const statusFilter = getStatusFilter(statusParam);

  let reportsQuery = supabase
    .from("reports")
    .select(
      "id, reporter_id, target_type, target_post_id, target_comment_id, target_user_id, reason, details, status, resolved_by, resolved_at, resolution_action, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (statusFilter !== "all") {
    reportsQuery = reportsQuery.eq("status", statusFilter);
  }

  const [{ data: reportsRaw }, { count: pendingCount }] = await Promise.all([
    reportsQuery,
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  const reports = (reportsRaw ?? []) as ReportRow[];

  const postIds = new Set<string>();
  const commentIds = new Set<string>();
  for (const report of reports) {
    if (report.target_post_id) postIds.add(report.target_post_id);
    if (report.target_comment_id) commentIds.add(report.target_comment_id);
  }

  const [{ data: postsRaw }, { data: commentsRaw }] = await Promise.all([
    postIds.size > 0
      ? supabase
          .from("posts")
          .select("id, title, slug, status, author_id")
          .in("id", Array.from(postIds))
      : Promise.resolve({ data: [] }),
    commentIds.size > 0
      ? supabase
          .from("comments")
          .select("id, content, post_id, author_id, hidden_at")
          .in("id", Array.from(commentIds))
      : Promise.resolve({ data: [] }),
  ]);

  const postsById = new Map(
    ((postsRaw ?? []) as PostRow[]).map((post) => [post.id, post])
  );
  const commentsById = new Map(
    ((commentsRaw ?? []) as CommentRow[]).map((comment) => [comment.id, comment])
  );

  const commentPostIds = new Set<string>();
  for (const comment of commentsById.values()) {
    if (!postsById.has(comment.post_id)) commentPostIds.add(comment.post_id);
  }

  const { data: commentPostsRaw } =
    commentPostIds.size > 0
      ? await supabase
          .from("posts")
          .select("id, title, slug, status, author_id")
          .in("id", Array.from(commentPostIds))
      : { data: [] };

  for (const post of (commentPostsRaw ?? []) as PostRow[]) {
    postsById.set(post.id, post);
  }

  const profileIds = new Set<string>();
  for (const report of reports) {
    profileIds.add(report.reporter_id);
    if (report.target_user_id) profileIds.add(report.target_user_id);
    if (report.resolved_by) profileIds.add(report.resolved_by);
  }
  for (const post of postsById.values()) profileIds.add(post.author_id);
  for (const comment of commentsById.values()) profileIds.add(comment.author_id);

  const { data: profilesRaw } =
    profileIds.size > 0
      ? await supabase
          .from("profiles")
          .select("id, username, full_name, role, suspended_at")
          .in("id", Array.from(profileIds))
      : { data: [] };

  const profilesById = new Map(
    ((profilesRaw ?? []) as ProfileRow[]).map((profile) => [profile.id, profile])
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Moderation</h1>
        <p className="text-gray-500 text-sm mt-1">
          {pendingCount ?? 0} open {pendingCount === 1 ? "report" : "reports"}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter}
            href={filter === "pending" ? "/admin/moderation" : `/admin/moderation?status=${filter}`}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors ${
              statusFilter === filter
                ? "bg-gray-900 text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            {filter}
          </Link>
        ))}
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>
            {statusFilter === "pending"
              ? "No open reports. All clear."
              : "No reports here."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const reporter = profilesById.get(report.reporter_id);
            const post = report.target_post_id
              ? postsById.get(report.target_post_id)
              : null;
            const comment = report.target_comment_id
              ? commentsById.get(report.target_comment_id)
              : null;
            const commentPost = comment ? postsById.get(comment.post_id) : null;
            const targetUser = report.target_user_id
              ? profilesById.get(report.target_user_id)
              : null;
            const resolver = report.resolved_by
              ? profilesById.get(report.resolved_by)
              : null;

            const subjectId =
              report.target_type === "user"
                ? report.target_user_id
                : report.target_type === "post"
                  ? post?.author_id ?? null
                  : comment?.author_id ?? null;
            const subject = subjectId ? profilesById.get(subjectId) : null;

            return (
              <div key={report.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize ${
                      STATUS_STYLES[report.status] ?? ""
                    }`}
                  >
                    {report.status}
                  </span>
                  <span className="rounded-full border border-red-100 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">
                    {REASON_LABELS[report.reason] ?? report.reason}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-gray-400">
                    {report.target_type}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {formatDate(report.created_at)}
                  </span>
                </div>

                <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                  {report.target_type === "post" ? (
                    post ? (
                      <div>
                        <Link
                          href={`/post/${post.slug}`}
                          className="font-medium text-gray-900 hover:text-emerald-700"
                        >
                          {post.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-gray-500">
                          by {profileName(profilesById.get(post.author_id))} · status:{" "}
                          {post.status}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">This post has been deleted.</p>
                    )
                  ) : null}

                  {report.target_type === "comment" ? (
                    comment ? (
                      <div>
                        <p className="text-gray-700">&ldquo;{commentExcerpt(comment.content)}&rdquo;</p>
                        <p className="mt-1 text-xs text-gray-500">
                          by {profileName(profilesById.get(comment.author_id))}
                          {commentPost ? (
                            <>
                              {" "}
                              on{" "}
                              <Link
                                href={`/post/${commentPost.slug}#comments`}
                                className="text-emerald-700 hover:underline"
                              >
                                {commentPost.title}
                              </Link>
                            </>
                          ) : null}
                          {comment.hidden_at ? " · currently hidden" : ""}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">This comment has been deleted.</p>
                    )
                  ) : null}

                  {report.target_type === "user" ? (
                    targetUser ? (
                      <div>
                        <Link
                          href={`/${targetUser.username ?? ""}`}
                          className="font-medium text-gray-900 hover:text-emerald-700"
                        >
                          {profileName(targetUser)}
                        </Link>
                        <p className="mt-0.5 text-xs text-gray-500">
                          @{targetUser.username}
                          {targetUser.suspended_at ? " · currently suspended" : ""}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">This account has been deleted.</p>
                    )
                  ) : null}
                </div>

                {report.details ? (
                  <p className="mt-2 text-sm text-gray-600">
                    <span className="font-medium text-gray-500">Reporter details:</span>{" "}
                    {report.details}
                  </p>
                ) : null}

                <p className="mt-2 text-xs text-gray-400">
                  Reported by {profileName(reporter)}
                  {report.status !== "pending" && resolver
                    ? ` · ${report.status} by ${profileName(resolver)}${
                        report.resolution_action && report.resolution_action !== "none"
                          ? ` (${report.resolution_action.replaceAll("_", " ")})`
                          : ""
                      }`
                    : null}
                </p>

                <div className="mt-3 border-t border-gray-100 pt-3">
                  <ModerationActions
                    reportId={report.id}
                    reportStatus={report.status}
                    targetType={report.target_type}
                    postId={post?.id ?? null}
                    postStatus={post?.status ?? null}
                    commentId={comment?.id ?? null}
                    commentHidden={!!comment?.hidden_at}
                    subjectUserId={subjectId}
                    subjectName={profileName(subject)}
                    subjectIsAdmin={subject?.role === "admin"}
                    subjectSuspended={!!subject?.suspended_at}
                    defaultSuspendReason={REASON_LABELS[report.reason] ?? report.reason}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
