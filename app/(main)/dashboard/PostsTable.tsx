"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { shouldUseRealtime } from "@/lib/realtime";
import Toast from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import { getPostDisplayTitle } from "@/lib/postDisplay";
import { getContentKindLabel, resolveContentKind } from "@/lib/contentModel";
import { deleteOwnDraftPosts } from "@/app/(write)/write/deleteActions";

/**
 * A row of the writer's own work.
 *
 * Phase 2I removed what the retired review workflow put here: the reviews and
 * editor decisions, the citation and published-version evidence, the revision
 * due date, the round counter, the research document fields and the position
 * in the editorial queue. A writer's dashboard lists what they wrote, what
 * state it is in, and how it is doing.
 */
export interface DashboardPost {
  id: string;
  author_id?: string;
  title: string | null;
  slug: string;
  content_kind?: string | null;
  status: string;
  impression_count: number;
  view_count: number;
  read_count: number;
  like_count: number;
  created_at: string;
  published_at: string | null;
  co_authors?: Array<{
    user_id: string;
    profile: { username: string; full_name: string | null } | null;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  pending: "bg-amber-100 text-amber-700",
  pending_revision: "bg-orange-100 text-orange-700",
  published: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-600",
  withdrawn: "bg-gray-100 text-gray-500",
};

// Posts and Articles are drafts or published. Rows left in a status the
// retired review workflow produced still appear under All.
const TABS = ["all", "published", "draft"] as const;
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
    content_kind: record.content_kind ?? existing?.content_kind ?? "post",
    status: record.status ?? existing?.status ?? "draft",
    impression_count:
      record.impression_count ?? existing?.impression_count ?? 0,
    view_count: record.view_count ?? existing?.view_count ?? 0,
    read_count: record.read_count ?? existing?.read_count ?? 0,
    like_count: existing?.like_count ?? 0,
    created_at: record.created_at ?? existing?.created_at ?? new Date().toISOString(),
    published_at: record.published_at ?? existing?.published_at ?? null,
    co_authors: record.co_authors ?? existing?.co_authors ?? [],
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
  const [rows, setRows] = useState<DashboardPost[]>(posts);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const statusMapRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    setRows(posts);
    statusMapRef.current = new Map(posts.map((post) => [post.id, post.status]));
  }, [posts]);

  const filtered =
    activeTab === "all" ? rows : rows.filter((p) => p.status === activeTab);

  const getStatusLabel = (post: DashboardPost) => post.status.replace("_", " ");

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
            setToastMessage("\uD83C\uDF89 Post published!");
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
    // The delete button only shows for status="draft" rows, but the decision
    // is not the button's to make. deleteOwnDraftPosts checks ownership and
    // status on the server before the statement runs, so a post submitted in
    // another tab is refused with a sentence rather than silently reported as
    // done. See lib/postDeletion.ts.
    const result = await deleteOwnDraftPosts({ postIds: [id] });
    setDeletingId(null);

    if (!result.ok) {
      setToastMessage(result.error);
      return;
    }

    statusMapRef.current.delete(id);
    setRows((prev) => prev.filter((post) => !result.data.deleted.includes(post.id)));
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
                  const kindLabel = getContentKindLabel(resolveContentKind(post));
                  // Every publication a writer owns is editable now. The
                  // read-only branch here existed for publications the database
                  // locked after review, and that lock was retired in
                  // 20260915000007_retire_review_publication_locks.sql.
                  const actionHref =
                    post.status === "draft"
                      ? `/write?draft=${post.id}`
                      : `/edit/${post.slug}`;
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
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-gray-500 text-xs">{kindLabel}</span>
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
                            Edit
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
