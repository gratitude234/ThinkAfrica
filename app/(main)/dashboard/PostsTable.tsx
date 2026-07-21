"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { shouldUseRealtime } from "@/lib/realtime";
import Toast from "@/components/ui/Toast";
import {
  formatDate,
  POST_POINTS,
  POST_TYPE_LABELS,
  type PostType,
} from "@/lib/utils";
import { getPostDisplayTitle } from "@/lib/postDisplay";
import {
  getArticleFormatLabel,
  getContentKindLabel,
  resolveArticleFormat,
  resolveContentKind,
} from "@/lib/contentModel";
import { withdrawSubmission } from "@/app/(write)/write/actions";

export interface DashboardPostReview {
  assigned_at: string;
  submitted_at: string | null;
  recommendation: string | null;
}

export interface DashboardEditorDecision {
  decision: string;
  created_at: string;
}

export interface DashboardPost {
  id: string;
  author_id?: string;
  title: string | null;
  slug: string;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  status: string;
  citation_id?: string | null;
  published_version_id?: string | null;
  current_round?: number | null;
  document_path?: string | null;
  document_original_name?: string | null;
  document_mime_type?: string | null;
  document_size_bytes?: number | null;
  impression_count: number;
  view_count: number;
  read_count: number;
  like_count: number;
  created_at: string;
  published_at: string | null;
  revision_due_at?: string | null;
  post_reviews?: DashboardPostReview[];
  post_editor_decisions?: DashboardEditorDecision[];
  co_authors?: Array<{
    user_id: string;
    profile: { username: string; full_name: string | null } | null;
  }>;
  queuePosition?: number | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  pending: "bg-amber-100 text-amber-700",
  pending_revision: "bg-orange-100 text-orange-700",
  published: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-600",
  withdrawn: "bg-gray-100 text-gray-500",
};

const TABS = [
  "all",
  "published",
  "pending",
  "pending_revision",
  "draft",
  "rejected",
  "withdrawn",
] as const;
type Tab = (typeof TABS)[number];

function normalizePost(
  record: Partial<DashboardPost> & { id: string },
  existing?: DashboardPost
): DashboardPost {
  return {
    id: record.id,
    author_id: record.author_id ?? existing?.author_id,
    title: record.title ?? existing?.title ?? "Untitled",
    slug: record.slug ?? existing?.slug ?? "",
    type: record.type ?? existing?.type ?? "blog",
    status: record.status ?? existing?.status ?? "draft",
    citation_id: record.citation_id ?? existing?.citation_id ?? null,
    published_version_id:
      record.published_version_id ?? existing?.published_version_id ?? null,
    current_round: record.current_round ?? existing?.current_round ?? 1,
    document_path: record.document_path ?? existing?.document_path ?? null,
    document_original_name:
      record.document_original_name ?? existing?.document_original_name ?? null,
    document_mime_type:
      record.document_mime_type ?? existing?.document_mime_type ?? null,
    document_size_bytes:
      record.document_size_bytes ?? existing?.document_size_bytes ?? null,
    impression_count:
      record.impression_count ?? existing?.impression_count ?? 0,
    view_count: record.view_count ?? existing?.view_count ?? 0,
    read_count: record.read_count ?? existing?.read_count ?? 0,
    like_count: existing?.like_count ?? 0,
    created_at: record.created_at ?? existing?.created_at ?? new Date().toISOString(),
    published_at: record.published_at ?? existing?.published_at ?? null,
    revision_due_at: record.revision_due_at ?? existing?.revision_due_at ?? null,
    post_reviews: record.post_reviews ?? existing?.post_reviews ?? [],
    post_editor_decisions:
      record.post_editor_decisions ?? existing?.post_editor_decisions ?? [],
    co_authors: record.co_authors ?? existing?.co_authors ?? [],
    queuePosition: record.queuePosition ?? existing?.queuePosition ?? null,
  };
}

export default function PostsTable({
  posts,
  userId,
}: {
  posts: DashboardPost[];
  userId: string;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [rows, setRows] = useState<DashboardPost[]>(posts);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const statusMapRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    setRows(posts);
    statusMapRef.current = new Map(posts.map((post) => [post.id, post.status]));
  }, [posts]);

  const filtered =
    activeTab === "all" ? rows : rows.filter((p) => p.status === activeTab);

  const getStatusLabel = (post: DashboardPost) => {
    const reviewedType = post.type === "research" || post.type === "policy_brief";
    if (reviewedType && post.status === "pending") return "Under review";
    if (reviewedType && post.status === "pending_revision") return "Revision requested";
    if (reviewedType && post.status === "rejected") return "Declined";
    return post.status.replace("_", " ");
  };

  const getReviewStatus = (post: DashboardPost) => {
    if (post.status === "pending_revision") {
      const dueDate = post.revision_due_at
        ? new Date(post.revision_due_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : null;
      return dueDate
        ? `Revision requested - due ${dueDate}`
        : "Revision requested";
    }

    if (post.status !== "pending") return null;

    const reviews = post.post_reviews ?? [];
    const decisions = post.post_editor_decisions ?? [];

    if (reviews.some((review) => !review.submitted_at)) {
      return "In review - awaiting reviewer feedback";
    }

    if (reviews.length > 0 && decisions.length === 0) {
      return "In review - editor deciding";
    }

    return "In review - awaiting assignment";
  };

  useEffect(() => {
    if (!shouldUseRealtime()) {
      return;
    }

    const supabase = createClient();

    const channel = supabase
      .channel(`dashboard-posts:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "posts",
          filter: `author_id=eq.${userId}`,
        },
        (payload) => {
          const record = payload.new as Partial<DashboardPost> & { id: string };
          const nextPost = normalizePost(record);

          statusMapRef.current.set(nextPost.id, nextPost.status);
          setRows((prev) => {
            if (prev.some((post) => post.id === nextPost.id)) {
              return prev;
            }

            return [nextPost, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "posts",
          filter: `author_id=eq.${userId}`,
        },
        (payload) => {
          const record = payload.new as Partial<DashboardPost> & { id: string };
          const previousStatus =
            statusMapRef.current.get(record.id) ??
            ((payload.old as Partial<DashboardPost>).status ?? null);

          setRows((prev) => {
            const existing = prev.find((post) => post.id === record.id);
            const nextPost = normalizePost(record, existing);

            statusMapRef.current.set(nextPost.id, nextPost.status);

            if (!existing) {
              return [nextPost, ...prev];
            }

            return prev.map((post) =>
              post.id === nextPost.id ? nextPost : post
            );
          });

          if (previousStatus === "pending" && record.status === "published") {
            const points = POST_POINTS[(record.type as PostType) ?? "blog"] ?? 0;
            setToastMessage(
              `\uD83C\uDF89 Post published! +${points} points earned`
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "posts",
          filter: `author_id=eq.${userId}`,
        },
        (payload) => {
          const deletedId = payload.old.id as string;
          statusMapRef.current.delete(deletedId);
          setRows((prev) => prev.filter((post) => post.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this draft? This cannot be undone.")) return;
    setDeletingId(id);
    const supabase = createClient();
    const { error } = await supabase.from("posts").delete().eq("id", id);
    setDeletingId(null);

    if (error) {
      // The delete button only shows for status="draft" rows, but the
      // actual protection lives in the guard_locked_post_write DB trigger,
      // which now only allows an author to hard-delete a draft, full stop
      // -- if this post's status changed underneath this tab (e.g.
      // submitted in another tab) the delete is rejected here rather than
      // silently reported as done.
      setToastMessage(error.message || "Couldn't delete this post.");
      return;
    }

    statusMapRef.current.delete(id);
    setRows((prev) => prev.filter((post) => post.id !== id));
  };

  const handleWithdraw = async (id: string) => {
    if (
      !confirm(
        "Withdraw this submission? It will stop being reviewed, but your draft content, references, and review history stay intact -- this is not the same as deleting it."
      )
    ) {
      return;
    }

    setWithdrawingId(id);
    const { error } = await withdrawSubmission({ postId: id });
    setWithdrawingId(null);

    if (error) {
      setToastMessage(error);
      return;
    }

    statusMapRef.current.set(id, "withdrawn");
    setRows((prev) =>
      prev.map((post) => (post.id === id ? { ...post, status: "withdrawn" } : post))
    );
  };

  return (
    <div>
      {/* Tab filter */}
      <div className="mb-4 overflow-x-auto">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit min-w-full sm:min-w-0">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize whitespace-nowrap ${
              activeTab === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm bg-white rounded-xl border border-gray-200">
          No posts in this category yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Title
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">
                    Type
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">
                    Impr.
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">
                    Views
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">
                    Reads
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">
                    Likes
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">
                    Date
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((post) => {
                  const reviewedPublication =
                    post.status === "published" &&
                    (post.type === "research" || post.type === "policy_brief");
                  const reviewStatus = getReviewStatus(post);
                  const resolvedKind = resolveContentKind(post);
                  const formatLabel = getArticleFormatLabel(resolveArticleFormat(post));
                  const typeLabel =
                    resolvedKind === "article"
                      ? formatLabel
                        ? `${getContentKindLabel(resolvedKind)} · ${formatLabel}`
                        : getContentKindLabel(resolvedKind)
                      : (POST_TYPE_LABELS[post.type as PostType] ?? post.type);
                  const actionHref =
                    post.type === "research" &&
                    (post.status === "draft" || post.status === "pending_revision")
                      ? `/submit/research?draft=${post.id}`
                      : post.status === "draft"
                      ? `/write?draft=${post.id}`
                      : reviewedPublication && post.citation_id
                        ? `/publication/${post.citation_id}`
                        : `/edit/${post.slug}`;
                  // A withdrawn (or otherwise no-longer-editable) research
                  // submission still routes to /submit/research -- that form
                  // now shows a read-only banner and disables Save/Submit
                  // for it -- but the link here should say "View", not
                  // "Edit", so it isn't misleading before the user even
                  // opens it.
                  const isEditableEntry =
                    post.type !== "research" ||
                    post.status === "draft" ||
                    post.status === "pending_revision";
                  return (
                    <tr key={post.id} className="hover:bg-canvas transition-colors">
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="font-medium text-gray-900 truncate">
                          {getPostDisplayTitle(post) ?? "Untitled post"}
                        </p>
                        {post.co_authors && post.co_authors.length > 0 ? (
                          <p className="mt-1 truncate text-xs text-gray-500">
                            With{" "}
                            {post.co_authors
                              .map(
                                (coAuthor) =>
                                  coAuthor.profile?.full_name ??
                                  coAuthor.profile?.username ??
                                  "coauthor"
                              )
                              .join(", ")}
                          </p>
                        ) : null}
                        {post.type === "research" ? (
                          <p className="mt-1 truncate text-xs text-purple-600">
                            {post.document_path
                              ? `PDF attached${post.document_original_name ? ` / ${post.document_original_name}` : ""}`
                              : "PDF missing"}
                          </p>
                        ) : null}
                        {reviewStatus ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                              {reviewStatus}
                            </span>
                            {post.queuePosition ? (
                              <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
                                Position ~{post.queuePosition} in review queue
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-gray-500 text-xs">{typeLabel}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[post.status] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {getStatusLabel(post)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                        {post.impression_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                        {post.view_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                        {post.read_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                        {post.like_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs hidden lg:table-cell">
                        {formatDate(post.published_at ?? post.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={actionHref}
                            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                          >
                            {reviewedPublication || !isEditableEntry ? "View" : "Edit"}
                          </Link>
                          {post.status === "draft" && (
                            <button
                              onClick={() => handleDelete(post.id)}
                              disabled={deletingId === post.id}
                              className="text-xs text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
                            >
                              {deletingId === post.id ? "Deleting" : "Delete"}
                            </button>
                          )}
                          {(post.status === "pending" || post.status === "pending_revision") && (
                            <button
                              onClick={() => handleWithdraw(post.id)}
                              disabled={withdrawingId === post.id}
                              className="text-xs text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
                            >
                              {withdrawingId === post.id ? "Withdrawing" : "Withdraw"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toastMessage ? (
        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
      ) : null}
    </div>
  );
}
