"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Toast from "@/components/ui/Toast";
import { formatDate, POST_POINTS, POST_TYPE_LABELS } from "@/lib/utils";

export interface DashboardPost {
  id: string;
  title: string;
  slug: string;
  type: string;
  status: string;
  view_count: number;
  like_count: number;
  created_at: string;
  published_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  pending: "bg-amber-100 text-amber-700",
  published: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-600",
};

const TABS = ["all", "published", "pending", "draft", "rejected"] as const;
type Tab = (typeof TABS)[number];

function normalizePost(
  record: Partial<DashboardPost> & { id: string },
  existing?: DashboardPost
): DashboardPost {
  return {
    id: record.id,
    title: record.title ?? existing?.title ?? "Untitled",
    slug: record.slug ?? existing?.slug ?? "",
    type: record.type ?? existing?.type ?? "blog",
    status: record.status ?? existing?.status ?? "draft",
    view_count: record.view_count ?? existing?.view_count ?? 0,
    like_count: existing?.like_count ?? 0,
    created_at: record.created_at ?? existing?.created_at ?? new Date().toISOString(),
    published_at: record.published_at ?? existing?.published_at ?? null,
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

  useEffect(() => {
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
            const points = POST_POINTS[record.type ?? "blog"] ?? 0;
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
    await supabase.from("posts").delete().eq("id", id);
    statusMapRef.current.delete(id);
    setRows((prev) => prev.filter((post) => post.id !== id));
    setDeletingId(null);
  };

  return (
    <div>
      {/* Tab filter */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors capitalize whitespace-nowrap ${
              activeTab === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
          No posts in this category yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
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
                    Views
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
                  const editHref =
                    post.status === "draft"
                      ? `/write?draft=${post.id}`
                      : `/edit/${post.slug}`;
                  return (
                    <tr key={post.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="font-medium text-gray-900 truncate">
                          {post.title}
                        </p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-gray-500 text-xs">
                          {POST_TYPE_LABELS[post.type] ?? post.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[post.status] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {post.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                        {post.view_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">
                        {post.like_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs hidden lg:table-cell">
                        {formatDate(post.published_at ?? post.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={editHref}
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
                              {deletingId === post.id ? "…" : "Delete"}
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
