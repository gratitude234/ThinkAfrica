"use client";

import Link from "next/link";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import CoAuthorPicker, {
  type CoAuthorProfile,
} from "@/components/collaboration/CoAuthorPicker";
import ProfileGate from "@/components/ui/ProfileGate";
import type { PostReferenceRecord } from "@/lib/types";
import { formatRelativeTime, type PostType } from "@/lib/utils";
import ContinueDraftBanner from "./ContinueDraftBanner";
import { useDraftManager } from "./DraftManager";
import MyDrafts from "./MyDrafts";
import PublishDrawer from "./PublishDrawer";
import { ensureDraft, savePostReferences } from "./actions";
import { composeContentWithSubtitle } from "./writeUtils";

const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[400px] animate-pulse rounded-lg border border-gray-200 bg-canvas" />
  ),
});

const POST_TYPES = [
  {
    type: "blog",
    label: "Quick take",
    minWords: 50,
    readTime: "~10 min to write",
    review: "No editorial review",
    desc: "One clear thought, example, or response",
  },
  {
    type: "essay",
    label: "Essay",
    minWords: 800,
    readTime: "~45 min to write",
    review: "Light editorial review",
    desc: "Structured argument, cultural commentary, analysis",
  },
  {
    type: "policy_brief",
    label: "Policy brief",
    minWords: 500,
    readTime: "~30 min to write",
    review: "Editorial review",
    desc: "Evidence-based recommendations for policymakers",
  },
  {
    type: "research",
    label: "Research paper",
    minWords: 3000,
    readTime: "Multiple sessions",
    review: "Full peer review process",
    desc: "Original research with citations and methodology",
  },
] as const;

const STARTER_TEMPLATES: Record<
  PostType,
  {
    title: string;
    subtitle: string;
    excerpt: string;
    tags: string[];
    content: string;
  }
> = {
  blog: {
    title: "One thing I think about [topic]",
    subtitle: "A quick take from my current reading and experience",
    excerpt: "A concise point on a question worth discussing.",
    tags: ["quick take"],
    content:
      "<p><strong>My point:</strong> State the idea you want readers to leave with.</p><p><strong>Why it matters:</strong> Explain the campus, community, or African context in plain language.</p><p><strong>One example:</strong> Add a concrete example, source, or lived observation.</p><p><strong>What should happen next:</strong> End with a question or recommendation.</p>",
  },
  essay: {
    title: "Rethinking [issue] in Africa",
    subtitle: "An argument with context, evidence, and a clear position",
    excerpt: "This essay argues for a more careful way to understand the issue.",
    tags: ["essay"],
    content:
      "<h2>Opening claim</h2><p>Introduce the issue and your position.</p><h2>Context</h2><p>Explain the background readers need before they can judge the argument.</p><h2>Evidence</h2><p>Bring in examples, data, readings, or cases.</p><h2>Counterargument</h2><p>Address the strongest objection to your view.</p><h2>Conclusion</h2><p>Close with what your argument changes.</p>",
  },
  policy_brief: {
    title: "Policy brief: Improving [issue]",
    subtitle: "Problem, evidence, options, and recommendations",
    excerpt: "A short policy brief with practical recommendations.",
    tags: ["policy"],
    content:
      "<h2>Problem</h2><p>Define the policy problem and who is affected.</p><h2>Evidence</h2><p>Summarize the strongest facts, cases, or research.</p><h2>Policy options</h2><p>Compare two or three realistic choices.</p><h2>Recommendation</h2><p>State what decision-makers should do and why.</p>",
  },
  research: {
    title: "Research: [question]",
    subtitle: "A study of [topic, place, or population]",
    excerpt: "This research examines a focused question using evidence and method.",
    tags: ["research"],
    content:
      "<h2>Abstract</h2><p>Summarize the question, method, finding, and contribution.</p><h2>Introduction</h2><p>Explain the research problem and why it matters.</p><h2>Literature and context</h2><p>Position your work in existing debates.</p><h2>Method</h2><p>Describe your data, sources, or analytical approach.</p><h2>Findings</h2><p>Present the main results clearly.</p><h2>Conclusion</h2><p>Explain implications and limits.</p>",
  },
};

function isPostType(value: string | null): value is PostType {
  return (
    value === "blog" ||
    value === "essay" ||
    value === "policy_brief" ||
    value === "research"
  );
}

interface DraftPayload {
  title: string;
  subtitle: string;
  excerpt: string;
  content: string;
  tags: string[];
  postType: PostType;
  coverImageUrl: string;
  inResponseToId: string | null;
}

function countWords(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export default function WritePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const responseToSlug = searchParams.get("response_to");
  const responseToIdParam = searchParams.get("inResponseTo");
  const typeParam = searchParams.get("type");
  const draftParam = searchParams.get("draft");
  const starterParam = searchParams.get("starter");
  const initialPostType = isPostType(typeParam) ? typeParam : "blog";
  const {
    draftId,
    saveStatus,
    lastSaved,
    saveDraft,
    initialData,
    loadingDraft,
    localBackup,
    restoreFromBackup,
    dismissBackup,
  } = useDraftManager();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profileInfo, setProfileInfo] = useState<{
    full_name: string | null;
    username: string | null;
    university: string | null;
  } | null>(null);
  const [loadingProfileInfo, setLoadingProfileInfo] = useState(true);
  const [postType, setPostType] = useState<PostType>(initialPostType);
  const [showChooser, setShowChooser] = useState(!typeParam && !draftParam);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [inResponseToId, setInResponseToId] = useState<string | null>(
    responseToIdParam
  );
  const [inResponseToTitle, setInResponseToTitle] = useState<string | null>(null);
  const [inResponseToAuthor, setInResponseToAuthor] = useState<string | null>(null);
  const [references, setReferences] = useState<PostReferenceRecord[]>([]);
  const [coAuthors, setCoAuthors] = useState<CoAuthorProfile[]>([]);
  const [wordCount, setWordCount] = useState(0);
  const [isPublishDrawerOpen, setIsPublishDrawerOpen] = useState(false);
  const [isProfileGateOpen, setIsProfileGateOpen] = useState(false);
  const [publishDraftId, setPublishDraftId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);

      if (!user) {
        setLoadingProfileInfo(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, username, university")
        .eq("id", user.id)
        .single();

      setProfileInfo(profile ?? null);
      setLoadingProfileInfo(false);
    });
  }, []);

  useEffect(() => {
    if (initialData) {
      setPostType((initialData.postType as PostType) ?? "blog");
      setTitle(initialData.title);
      setSubtitle(initialData.subtitle ?? "");
      setExcerpt(initialData.excerpt);
      setTags(initialData.tags);
      setContent(initialData.content);
      setCoverImageUrl(initialData.coverImageUrl);
      setInResponseToId(initialData.inResponseToId);
      setWordCount(countWords(initialData.content));
    }
  }, [initialData]);

  useEffect(() => {
    const supabase = createClient();

    async function loadParentPost() {
      if (responseToIdParam) {
        const { data: parentPost } = await supabase
          .from("posts")
          .select("id, title, profiles!posts_author_id_fkey(username)")
          .eq("id", responseToIdParam)
          .eq("status", "published")
          .single();

        if (parentPost) {
          const authorProfile = Array.isArray(parentPost.profiles)
            ? parentPost.profiles[0]
            : (parentPost.profiles as { username: string } | null);
          setInResponseToId(parentPost.id);
          setInResponseToTitle(parentPost.title);
          setInResponseToAuthor(authorProfile?.username ?? null);
          return;
        }

        setInResponseToId(null);
        setInResponseToTitle(null);
        setInResponseToAuthor(null);
        return;
      }

      if (responseToSlug) {
        const { data: parentPost } = await supabase
          .from("posts")
          .select("id, title, profiles!posts_author_id_fkey(username)")
          .eq("slug", responseToSlug)
          .eq("status", "published")
          .single();

        if (parentPost) {
          const authorProfile = Array.isArray(parentPost.profiles)
            ? parentPost.profiles[0]
            : (parentPost.profiles as { username: string } | null);
          setInResponseToId(parentPost.id);
          setInResponseToTitle(parentPost.title);
          setInResponseToAuthor(authorProfile?.username ?? null);
          return;
        }

        setInResponseToId(null);
        setInResponseToTitle(null);
        setInResponseToAuthor(null);
        return;
      }

      if (inResponseToId) {
        const { data: parentPost } = await supabase
          .from("posts")
          .select("id, title, profiles!posts_author_id_fkey(username)")
          .eq("id", inResponseToId)
          .single();

        if (parentPost) {
          const authorProfile = Array.isArray(parentPost.profiles)
            ? parentPost.profiles[0]
            : (parentPost.profiles as { username: string } | null);
          setInResponseToId(parentPost.id);
          setInResponseToTitle(parentPost.title);
          setInResponseToAuthor(authorProfile?.username ?? null);
          return;
        }

        setInResponseToId(null);
      }

      setInResponseToTitle(null);
      setInResponseToAuthor(null);
    }

    void loadParentPost();
  }, [inResponseToId, responseToIdParam, responseToSlug]);

  useEffect(() => {
    setPublishDraftId(draftId);
  }, [draftId]);

  useEffect(() => {
    if (!draftId) {
      setReferences([]);
      return;
    }

    const supabase = createClient();
    supabase
      .from("post_references")
      .select("*")
      .eq("post_id", draftId)
      .order("display_order", { ascending: true })
      .then(({ data }) => {
        setReferences((data as PostReferenceRecord[] | null) ?? []);
      });
  }, [draftId]);

  const getCurrentData = useCallback(
    (overrides: Partial<DraftPayload> = {}): DraftPayload => ({
      title: overrides.title ?? title,
      subtitle: overrides.subtitle ?? subtitle,
      excerpt: overrides.excerpt ?? excerpt,
      content: overrides.content ?? content,
      tags: overrides.tags ?? tags,
      postType: overrides.postType ?? postType,
      coverImageUrl: overrides.coverImageUrl ?? coverImageUrl,
      inResponseToId: overrides.inResponseToId ?? inResponseToId,
    }),
    [title, subtitle, excerpt, content, tags, postType, coverImageUrl, inResponseToId]
  );

  const handleEditorUpdate = useCallback((html: string, words: number) => {
    setContent(html);
    setWordCount(words);
  }, []);

  const handleMetadataChange = useCallback(
    (changes: {
      postType?: PostType;
      tags?: string[];
      coverImageUrl?: string;
      excerpt?: string;
      references?: PostReferenceRecord[];
      inResponseToId?: string | null;
    }) => {
      if (changes.postType) setPostType(changes.postType);
      if (changes.tags) setTags(changes.tags);
      if (typeof changes.coverImageUrl === "string") {
        setCoverImageUrl(changes.coverImageUrl);
      }
      if (typeof changes.excerpt === "string") {
        setExcerpt(changes.excerpt);
      }
      if (changes.references) {
        setReferences(changes.references);
      }
      if ("inResponseToId" in changes) {
        setInResponseToId(changes.inResponseToId ?? null);
      }

      void saveDraft(
        getCurrentData({
          postType: changes.postType,
          tags: changes.tags,
          coverImageUrl: changes.coverImageUrl,
          excerpt: changes.excerpt,
          inResponseToId: changes.inResponseToId,
        })
      );
    },
    [getCurrentData, saveDraft]
  );

  const saveStatusText = useMemo(() => {
    if (saveStatus === "saving") return "Saving draft...";
    if (saveStatus === "saved" && lastSaved) {
      return `Saved ${formatRelativeTime(lastSaved.toISOString())}`;
    }
    if (saveStatus === "error") return "Couldn't save draft";
    if (saveStatus === "idle") return draftId ? "Draft ready" : "Autosave on";
    return "Unsaved changes";
  }, [draftId, lastSaved, saveStatus]);

  const canOpenPublish =
    title.trim().length > 0 &&
    wordCount > 0 &&
    !!currentUserId &&
    !loadingProfileInfo;
  const selectedPostType =
    POST_TYPES.find((item) => item.type === postType) ?? POST_TYPES[0];
  const wordProgress = Math.min(
    100,
    (wordCount / selectedPostType.minWords) * 100
  );
  const estimatedReadTime = Math.max(1, Math.ceil(wordCount / 200));

  const handleReadyToPublish = async () => {
    if (!canOpenPublish) return;

    if (!profileInfo?.username) {
      setIsProfileGateOpen(true);
      return;
    }

    if (!publishDraftId) {
      const contentWithSubtitle = composeContentWithSubtitle(content, subtitle);
      const { draftId: ensuredDraftId } = await ensureDraft({
        draftId,
        title,
        subtitle,
        excerpt,
        content: contentWithSubtitle,
        tags,
        postType,
        coverImageUrl,
        inResponseTo: inResponseToId,
      });

      if (ensuredDraftId) {
        setPublishDraftId(ensuredDraftId);
        if (references.length > 0) {
          void savePostReferences({
            postId: ensuredDraftId,
            references,
          });
        }
      }
    }

    setIsPublishDrawerOpen(true);
  };

  const applyTemplate = (templateType: PostType) => {
    const template = STARTER_TEMPLATES[templateType];
    const nextData = getCurrentData({
      title: template.title,
      subtitle: template.subtitle,
      excerpt: template.excerpt,
      content: template.content,
      tags: template.tags,
      postType: templateType,
    });

    setPostType(templateType);
    setShowChooser(false);
    setTitle(template.title);
    setSubtitle(template.subtitle);
    setExcerpt(template.excerpt);
    setTags(template.tags);
    setContent(template.content);
    setWordCount(countWords(template.content));
    void saveDraft(nextData);
  };

  if (loadingDraft) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-gray-400">
        Loading draft...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="text-sm font-semibold tracking-wide text-gray-900">
          ThinkAfrica
        </Link>
        <p className="text-xs text-gray-400">{saveStatusText}</p>
        <div className="flex items-center gap-3 sm:justify-end">
          <Button variant="ghost" type="button" onClick={() => router.push("/")}>
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={!canOpenPublish}
            onClick={handleReadyToPublish}
          >
            Ready to publish
          </Button>
        </div>
      </div>

      {localBackup ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <span className="text-amber-800">
            We found an unsaved draft: &quot;{localBackup.title || "Untitled"}&quot;
          </span>
          <div className="ml-4 flex flex-shrink-0 gap-3">
            <button
              type="button"
              onClick={restoreFromBackup}
              className="font-medium text-amber-700 underline hover:text-amber-900"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={dismissBackup}
              className="text-amber-500 hover:text-amber-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <ContinueDraftBanner activeDraftId={draftId} />
      <MyDrafts activeDraftId={draftId} />

      {showChooser ? (
        <div className="py-6">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-brand">
              Choose format
            </p>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">
              What are you writing?
            </h1>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {POST_TYPES.map((type) => {
              const selected = postType === type.type;

              return (
                <button
                  key={type.type}
                  type="button"
                  onClick={() => {
                    setPostType(type.type);
                    setShowChooser(false);
                    if (draftId) {
                      void saveDraft(getCurrentData({ postType: type.type }));
                    }
                  }}
                  className={`rounded-xl border bg-white p-5 text-left transition-all hover:border-emerald-300 hover:ring-2 hover:ring-emerald-100 ${
                    selected
                      ? "border-emerald-brand ring-2 ring-emerald-100"
                      : "border-gray-200"
                  }`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-bold text-gray-900">
                        {type.label}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">{type.desc}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-gray-600">
                      min. {type.minWords.toLocaleString()} words
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                      {type.readTime}
                    </span>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                      {type.review}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {!showChooser ? (
      <div className="space-y-4">
        <div>
          <button
            type="button"
            onClick={() => setShowChooser(true)}
            className="mb-5 text-sm font-medium text-emerald-600 hover:underline"
          >
            {"<-"} Change type
          </button>

          {inResponseToId && inResponseToTitle ? (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Writing a response to
                </p>
                <p className="mt-0.5 truncate text-sm font-medium text-gray-900">
                  {inResponseToTitle}
                  {inResponseToAuthor ? (
                    <span className="ml-1 font-normal text-gray-500">
                      by @{inResponseToAuthor}
                    </span>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInResponseToId(null);
                  setInResponseToTitle(null);
                  setInResponseToAuthor(null);
                  void saveDraft(getCurrentData({ inResponseToId: null }));
                  router.replace(draftId ? `/write?draft=${draftId}` : "/write");
                }}
                className="text-xs text-gray-400 hover:text-gray-600"
                aria-label="Remove response link"
              >
                Remove
              </button>
            </div>
          ) : null}

          {currentUserId ? (
            <div className="mb-6">
              <CoAuthorPicker
                userId={currentUserId}
                value={coAuthors}
                onChange={setCoAuthors}
                source="write"
              />
            </div>
          ) : null}

          {(starterParam === "1" || (!draftParam && wordCount === 0)) ? (
            <div className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">
                    Start with a guided template
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                    Choose a structure and replace the prompts with your own argument.
                  </p>
                </div>
                {draftId ? (
                  <p className="text-xs font-medium text-emerald-700">
                    Draft saved. Add your words, then use Ready to publish.
                  </p>
                ) : null}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {POST_TYPES.map((type) => (
                  <button
                    key={type.type}
                    type="button"
                    onClick={() => applyTemplate(type.type)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      postType === type.type
                        ? "border-emerald-300 bg-white text-emerald-900"
                        : "border-emerald-100 bg-emerald-50/50 text-emerald-800 hover:bg-white"
                    }`}
                  >
                    <span className="block font-medium">{type.label}</span>
                    <span className="mt-0.5 block text-xs opacity-80">
                      Use starter structure
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <input
            type="text"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              saveDraft(getCurrentData({ title: event.target.value }));
            }}
            placeholder="What are you writing about?"
            className="mb-4 w-full border-none px-0 text-3xl font-bold text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-0"
          />

          {title.trim().length > 0 ? (
            <input
              type="text"
              value={subtitle}
              onChange={(event) => {
                setSubtitle(event.target.value);
                saveDraft(getCurrentData({ subtitle: event.target.value }));
              }}
              placeholder="Add a subtitle (optional)"
              className="mb-6 w-full border-none px-0 text-lg text-gray-500 placeholder-gray-300 focus:outline-none focus:ring-0"
            />
          ) : null}

          <Editor
            key={publishDraftId ?? draftId ?? (initialData ? "draft" : "empty")}
            content={content}
            placeholder="Start writing..."
            minWords={selectedPostType.minWords}
            postType={postType}
            references={references}
            onReferencesChange={setReferences}
            onUpdate={handleEditorUpdate}
            onAutoSave={async () => {
              await saveDraft(getCurrentData());
              if (publishDraftId) {
                await savePostReferences({
                  postId: publishDraftId,
                  references,
                });
              }
            }}
          />
          <div className="sticky bottom-0 z-20 border-t border-gray-100 bg-white px-4 py-3 shadow-[0_-8px_20px_rgba(15,23,42,0.04)]">
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  wordCount >= selectedPostType.minWords
                    ? "bg-emerald-500"
                    : "bg-gray-300"
                }`}
                style={{ width: `${wordProgress}%` }}
              />
            </div>
            <p className="text-xs font-medium text-gray-500">
              {wordCount.toLocaleString()} /{" "}
              {selectedPostType.minWords.toLocaleString()} words /{" "}
              {selectedPostType.label} / {estimatedReadTime} min read
            </p>
          </div>
        </div>
      </div>
      ) : null}

      {currentUserId ? (
        <>
          <PublishDrawer
            open={isPublishDrawerOpen}
            onClose={() => setIsPublishDrawerOpen(false)}
            draftId={publishDraftId}
            title={title}
            subtitle={subtitle}
            content={content}
            wordCount={wordCount}
            userId={currentUserId}
            initialTags={tags}
            initialCoverImageUrl={coverImageUrl}
            initialExcerpt={excerpt}
            initialPostType={postType}
            initialReferences={references}
            initialCoAuthors={coAuthors}
            inResponseTo={inResponseToId}
            onMetadataChange={handleMetadataChange}
            onCoAuthorsChange={setCoAuthors}
          />
          <ProfileGate
            open={isProfileGateOpen}
            userId={currentUserId}
            initialProfile={profileInfo}
            onClose={() => setIsProfileGateOpen(false)}
            onComplete={(profile) => {
              setProfileInfo(profile);
              setIsProfileGateOpen(false);
              void handleReadyToPublish();
            }}
          />
        </>
      ) : null}
    </div>
  );
}
