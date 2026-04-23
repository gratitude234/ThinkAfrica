"use client";

import Link from "next/link";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Button from "@/components/ui/Button";
import TagInput from "@/components/ui/TagInput";
import { MIN_WORD_COUNTS, POST_TYPE_LABELS, type PostType } from "@/lib/utils";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import type {
  PostEditorDecisionRecord,
  PostReferenceRecord,
  PostReviewRecord,
  PostStatus,
  PostVersionRecord,
  VersionAuthorRecord,
} from "@/lib/types";
import { saveEditedPost } from "./actions";

const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[400px] animate-pulse rounded-lg border border-gray-200 bg-canvas" />
  ),
});

const POST_TYPES: PostType[] = ["blog", "essay", "research", "policy_brief"];

interface Post {
  id: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  type: string;
  status: PostStatus;
  tags: string[] | null;
  cover_image_url: string | null;
  current_round: number;
  revision_due_at: string | null;
  citation_id: string | null;
  published_version_id: string | null;
}

interface EditFormProps {
  post: Post;
  initialReferences: PostReferenceRecord[];
  versions: Array<{
    id: string;
    version_number: number;
    version_kind: string;
    round: number;
    author_note: string | null;
    created_at: string;
  }>;
  reviewHistory: Array<
    PostReviewRecord & {
      reviewer: { full_name: string | null; username: string } | null;
    }
  >;
  decisionHistory: PostEditorDecisionRecord[];
  versionHistory: PostVersionRecord[];
  authorHistory: VersionAuthorRecord[];
}

function formatRoundLabel(round: number) {
  return `Round ${round}`;
}

export default function EditForm({
  post,
  initialReferences,
  versions,
  reviewHistory,
  decisionHistory,
  versionHistory,
  authorHistory,
}: EditFormProps) {
  const router = useRouter();
  const [postType, setPostType] = useState<PostType>((post.type as PostType) ?? "blog");
  const [title, setTitle] = useState(post.title);
  const [excerpt, setExcerpt] = useState(post.excerpt ?? "");
  const [tags, setTags] = useState<string[]>(post.tags ?? []);
  const [content, setContent] = useState(post.content ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(post.cover_image_url ?? "");
  const [references, setReferences] = useState<PostReferenceRecord[]>(initialReferences);
  const [authorNote, setAuthorNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reviewedPublicationLocked =
    post.status === "published" &&
    (post.type === "research" || post.type === "policy_brief");
  const currentRoundReviews = useMemo(
    () => reviewHistory.filter((review) => review.round === post.current_round),
    [post.current_round, reviewHistory]
  );

  const roundTimeline = useMemo(() => {
    const rounds = new Set<number>([
      post.current_round,
      ...reviewHistory.map((review) => review.round),
      ...decisionHistory.map((decision) => decision.round),
      ...versionHistory.map((version) => version.round),
    ]);

    return Array.from(rounds)
      .sort((left, right) => right - left)
      .map((round) => ({
        round,
        reviews: reviewHistory.filter((review) => review.round === round),
        decision: decisionHistory.find((decision) => decision.round === round) ?? null,
        versions: versionHistory.filter((version) => version.round === round),
      }));
  }, [decisionHistory, post.current_round, reviewHistory, versionHistory]);

  const doSave = useCallback(
    async (silent = false) => {
      if (reviewedPublicationLocked) {
        return;
      }

      if (!silent) {
        setLoading(true);
      }

      setError(null);
      const { error: updateError } = await saveEditedPost({
        postId: post.id,
        title,
        excerpt,
        content,
        tags,
        postType,
        coverImageUrl,
        currentStatus: post.status,
        currentRound: post.current_round,
        authorNote,
        references,
      });

      if (updateError) {
        if (!silent) {
          setError(updateError);
        }
      } else if (!silent) {
        router.push("/dashboard");
      }

      if (!silent) {
        setLoading(false);
      }
    },
    [
      reviewedPublicationLocked,
      post.id,
      title,
      excerpt,
      content,
      tags,
      postType,
      coverImageUrl,
      post.status,
      post.current_round,
      authorNote,
      references,
      router,
    ]
  );

  useEffect(() => {
    if (reviewedPublicationLocked) {
      return;
    }

    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
    }

    autosaveTimer.current = setTimeout(() => {
      void doSave(true);
    }, 5000);

    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
      }
    };
  }, [
    reviewedPublicationLocked,
    title,
    excerpt,
    tags,
    postType,
    coverImageUrl,
    references,
    authorNote,
    doSave,
  ]);

  const handleEditorUpdate = useCallback((html: string) => {
    setContent(html);
  }, []);

  const submissionDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    []
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Editorial workspace</h1>
          <p className="mt-1 text-sm text-gray-500">
            Status: <span className="font-medium capitalize">{post.status.replace("_", " ")}</span>
          </p>
        </div>
        {post.citation_id ? (
          <Link
            href={`/publication/${post.citation_id}`}
            className="text-sm font-medium text-emerald-brand hover:underline"
          >
            View cited publication
          </Link>
        ) : null}
      </div>

      {authorHistory.length > 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Authorship
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {authorHistory.map((author) => (
              <span
                key={author.user_id}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
              >
                {author.profile?.full_name ?? author.profile?.username}
                {author.corresponding_author ? " · Corresponding" : ""}
                {!author.accepted_at ? " · Pending acceptance" : ""}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Editorial history</h2>
          <p className="mt-1 text-sm text-gray-500">
            Each round shows reviewer input, the editor decision, and the version submitted in response.
          </p>
        </div>

        <div className="space-y-4">
          {roundTimeline.map((roundItem) => (
            <div key={roundItem.round} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-900">
                  {formatRoundLabel(roundItem.round)}
                </p>
                {roundItem.round === post.current_round ? (
                  <span className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                    Current round
                  </span>
                ) : null}
              </div>

              {roundItem.decision ? (
                <div className="mt-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Editor decision
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {roundItem.decision.decision.replace("_", " ")}
                  </p>
                  {roundItem.decision.notes ? (
                    <p className="mt-1 text-sm text-gray-600">{roundItem.decision.notes}</p>
                  ) : null}
                </div>
              ) : null}

              {roundItem.reviews.length > 0 ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {roundItem.reviews.map((review) => (
                    <div key={review.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {review.recommendation ?? "Awaiting review"}
                      </p>
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        {review.reviewer?.full_name ?? review.reviewer?.username ?? "Reviewer"}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        {review.notes || "No written note provided."}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {roundItem.versions.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {roundItem.versions.map((version) => (
                    <div
                      key={version.id}
                      className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                        Version {version.version_number} · {version.version_kind}
                      </p>
                      <p className="mt-1 text-sm font-medium text-gray-900">{version.title}</p>
                      {version.author_note ? (
                        <p className="mt-1 text-sm text-gray-600">{version.author_note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {versions.length > 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Submission history</h2>
              <p className="mt-1 text-xs text-gray-500">
                Snapshot timeline for your submitted versions.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {versions.map((version) => {
              const dotClassName =
                version.version_kind === "publication"
                  ? "bg-emerald-500"
                  : version.version_kind === "revision"
                    ? "bg-amber-400"
                    : "bg-sky-400";

              return (
                <div
                  key={version.id}
                  className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3"
                >
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full ${dotClassName}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        v{version.version_number}
                      </span>
                      <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-600">
                        {version.version_kind}
                      </span>
                      <span className="text-xs font-medium text-gray-500">
                        Round {version.round}
                      </span>
                      <span className="text-xs text-gray-400">
                        {submissionDateFormatter.format(new Date(version.created_at))}
                      </span>
                    </div>
                    {version.author_note ? (
                      <p className="mt-1 text-xs italic text-gray-500">{version.author_note}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {post.status === "pending_revision" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Revision requested — respond to round {post.current_round} by{" "}
            {post.revision_due_at
              ? new Date(post.revision_due_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "the requested deadline"}
            .
          </p>
          {currentRoundReviews.length > 0 ? (
            <div className="mt-3 space-y-3">
              {currentRoundReviews.map((note) => (
                <div
                  key={note.id}
                  className="rounded-lg border border-amber-100 bg-white px-3 py-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    {note.recommendation}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    {note.notes || "No written note provided."}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {note.reviewer?.full_name ?? note.reviewer?.username ?? "Reviewer"}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {reviewedPublicationLocked ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-5">
          <p className="text-sm font-medium text-sky-900">
            This publication is locked because it has already been accepted and cited.
          </p>
          <p className="mt-1 text-sm text-sky-800">
            Reviewed publications stay immutable after acceptance so the citation record remains stable.
          </p>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void doSave(false);
          }}
          className="space-y-6"
        >
          <CoverImageUploader
            initialUrl={coverImageUrl}
            onUpload={setCoverImageUrl}
            onRemove={() => setCoverImageUrl("")}
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Post type</label>
            <div className="flex flex-wrap gap-2">
              {POST_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPostType(type)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    postType === type
                      ? "border-emerald-brand bg-emerald-brand text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
                  }`}
                >
                  {POST_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-base font-medium focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Summary</label>
            <div className="relative">
              <textarea
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                maxLength={200}
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
              />
              <span className="absolute bottom-2 right-2 text-xs text-gray-400">
                {excerpt.length}/200
              </span>
            </div>
          </div>

          <TagInput
            label="Tags"
            value={tags}
            helperText="Add up to five tags to keep this post discoverable."
            onChange={setTags}
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Content</label>
            <Editor
              content={content}
              minWords={MIN_WORD_COUNTS[postType]}
              postType={postType}
              references={references}
              onReferencesChange={setReferences}
              onUpdate={handleEditorUpdate}
              onAutoSave={() => doSave(true)}
            />
          </div>

          {post.status === "pending_revision" ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Author response for this revision
              </label>
              <textarea
                value={authorNote}
                onChange={(event) => setAuthorNote(event.target.value)}
                rows={4}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
                placeholder="Summarize what changed in response to the editor and reviewer feedback."
              />
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => router.push("/dashboard")}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} size="lg">
              Save changes
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
