"use client";

import Link from "next/link";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import WriteReadinessPanel from "./WriteReadinessPanel";
import { ensureDraft, savePostReferences } from "./actions";
import { STARTER_TEMPLATES, WRITE_FORMATS, isPostType } from "./writeConfig";
import { composeContentWithSubtitle } from "./writeUtils";
import type { EditorHandle } from "@/components/editor/Editor";

const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[400px] animate-pulse rounded-lg border border-gray-200 bg-canvas" />
  ),
});

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

const MOBILE_TOOLBAR_BUTTONS = [
  { label: "B", title: "Bold", action: "bold", italic: false },
  { label: "I", title: "Italic", action: "italic", italic: true },
  { label: "H2", title: "Heading", action: "heading", italic: false },
  { label: "—", title: "List", action: "list", italic: false },
  { label: "❝", title: "Quote", action: "quote", italic: false },
] as const;

type MobileToolbarAction = (typeof MOBILE_TOOLBAR_BUTTONS)[number]["action"];

function countWords(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function getBodyPlaceholder(postType: PostType) {
  if (postType === "essay") return "Open with the question your essay answers.";
  if (postType === "policy_brief") return "State the policy problem in one sentence.";
  if (postType === "research") return "Introduce your research question and methodology.";
  return "Lead with your argument — the one point you want readers to leave with.";
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
  const [showChooser, setShowChooser] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("write_sidebar_collapsed") === "1";
    }
    return false;
  });
  const editorRef = useRef<EditorHandle>(null);
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
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
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

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("write_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }, []);

  const canOpenPublish =
    title.trim().length > 0 &&
    wordCount > 0 &&
    !!currentUserId &&
    !loadingProfileInfo;
  const selectedPostType =
    WRITE_FORMATS.find((item) => item.type === postType) ?? WRITE_FORMATS[0];
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
    setIsDetailsOpen(false);
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

  const runMobileToolbarAction = (action: MobileToolbarAction) => {
    if (action === "bold") editorRef.current?.toggleBold();
    if (action === "italic") editorRef.current?.toggleItalic();
    if (action === "heading") editorRef.current?.toggleH2();
    if (action === "list") editorRef.current?.toggleBulletList();
    if (action === "quote") editorRef.current?.toggleBlockquote();
  };

  if (loadingDraft) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-gray-400">
        Loading draft...
      </div>
    );
  }

  const showStructureStrip =
    starterParam === "1" || (!draftParam && wordCount === 0);
  const supportTools = (
    <>
      <ContinueDraftBanner activeDraftId={draftId} variant="panel" />
      <MyDrafts activeDraftId={draftId} variant="panel" />
      {currentUserId ? (
        <CoAuthorPicker
          userId={currentUserId}
          value={coAuthors}
          onChange={setCoAuthors}
          source="write"
        />
      ) : null}
    </>
  );
  const readinessPanel = (
    <WriteReadinessPanel
      postType={postType}
      title={title}
      content={content}
      excerpt={excerpt}
      tags={tags}
      references={references}
      coAuthors={coAuthors}
      profileInfo={profileInfo}
      inResponseToTitle={inResponseToTitle}
      saveStatusText={saveStatusText}
      wordCount={wordCount}
      estimatedReadTime={estimatedReadTime}
      wordProgress={wordProgress}
      canOpenPublish={canOpenPublish}
      onChangeFormat={() => setShowChooser(true)}
      onReadyToPublish={handleReadyToPublish}
    >
      {supportTools}
    </WriteReadinessPanel>
  );

  return (
    <div className={`mx-auto max-w-6xl pb-24 lg:pb-0 ${focusMode ? "focus-mode" : ""}`}>
      {focusMode ? (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-3 rounded-full border border-gray-200 bg-white/90 px-4 py-2 shadow-md backdrop-blur-sm">
          <span className={`text-xs ${saveStatus === "error" ? "text-amber-600" : "text-gray-400"}`}>
            {wordCount.toLocaleString()} words · {saveStatusText}
          </span>
          <button
            type="button"
            onClick={() => setFocusMode(false)}
            className="text-xs font-semibold text-gray-500 hover:text-gray-800"
          >
            Exit focus
          </button>
        </div>
      ) : (
        <div className="mb-6 flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="text-sm font-semibold tracking-wide text-gray-900">
            ThinkAfrica
          </Link>
          <p className={`text-xs ${saveStatus === "error" ? "text-amber-600" : "text-gray-400"}`}>
            {saveStatusText}
          </p>
          <div className="flex items-center gap-3 sm:justify-end">
            <button
              type="button"
              onClick={() => setFocusMode(true)}
              title="Focus mode — hide distractions"
              className="hidden rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-emerald-200 hover:text-emerald-700 sm:block"
            >
              Focus
            </button>
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
      )}

      {!focusMode && !loadingProfileInfo && currentUserId && !profileInfo?.username ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <span className="text-amber-800">
            You&apos;ll need a complete profile to publish. You can still draft now.
          </span>
          <Link
            href="/settings"
            className="ml-4 shrink-0 font-medium text-amber-700 underline hover:text-amber-900"
          >
            Complete profile →
          </Link>
        </div>
      ) : null}

      {!focusMode && localBackup ? (
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

      <div
        className={
          showChooser || focusMode || sidebarCollapsed
            ? ""
            : "grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"
        }
      >
        <div className="min-w-0">
      {showChooser ? (
        <div className="py-6">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-brand">
              Choose format
            </p>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">
              What are you creating?
            </h1>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {WRITE_FORMATS.map((type) => {
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
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        {type.signalLabel}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-gray-600">
                        {type.portfolioValue}
                      </p>
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
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
                      {type.requirementsSummary}
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
          {!focusMode ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-brand">
                {selectedPostType.label}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {selectedPostType.desc}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowChooser(true)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-emerald-200 hover:text-emerald-700"
            >
              Change format
            </button>
          </div>
          ) : null}

          {!focusMode && inResponseToId && inResponseToTitle ? (
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

          <input
            type="text"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              saveDraft(getCurrentData({ title: event.target.value }));
            }}
            placeholder="Title your idea"
            className="mb-3 w-full border-none px-0 text-4xl font-semibold leading-tight text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-0"
          />

          <input
            type="text"
            value={subtitle}
            onChange={(event) => {
              setSubtitle(event.target.value);
              saveDraft(getCurrentData({ subtitle: event.target.value }));
            }}
            placeholder="Add a subtitle (optional)"
            className="mb-5 w-full border-none px-0 text-lg text-gray-500 placeholder-gray-300 focus:outline-none focus:ring-0"
          />

          {!focusMode && showStructureStrip ? (
            <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">
                    Start with structure
                  </p>
                  <p className="text-xs leading-relaxed text-emerald-800">
                    Add a starter outline, then replace the prompts with your own argument.
                  </p>
                </div>
                {draftId ? (
                  <p className="text-xs font-medium text-emerald-700">
                    Draft saved
                  </p>
                ) : null}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                {WRITE_FORMATS.map((type) => (
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
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <Editor
            ref={editorRef}
            key={`${publishDraftId ?? draftId ?? (initialData ? "draft" : "empty")}-${postType}`}
            content={content}
            placeholder={getBodyPlaceholder(postType)}
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
          {!focusMode ? (
            <div className="sticky bottom-0 z-20 border-t border-gray-100 bg-white shadow-[0_-8px_20px_rgba(15,23,42,0.04)] lg:hidden">
              {/* Formatting toolbar row — large touch targets, stays near keyboard */}
              <div className="flex items-center gap-0.5 border-b border-gray-100 px-2 py-1.5">
                {MOBILE_TOOLBAR_BUTTONS.map((btn) => (
                  <button
                    key={btn.title}
                    type="button"
                    title={btn.title}
                    onClick={() => runMobileToolbarAction(btn.action)}
                    className="flex h-10 min-w-[40px] items-center justify-center rounded-lg px-3 text-sm font-medium text-gray-600 transition-colors active:bg-emerald-100"
                  >
                    {btn.italic ? <em>{btn.label}</em> : btn.label}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-1 pr-1">
                  <button
                    type="button"
                    onClick={() => setFocusMode(true)}
                    title="Focus mode"
                    className="flex h-10 items-center px-3 text-xs font-medium text-gray-400"
                  >
                    Focus
                  </button>
                </div>
              </div>
              {/* Progress + actions row */}
              <div className="px-4 py-2.5">
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      wordCount >= selectedPostType.minWords ? "bg-emerald-500" : "bg-gray-300"
                    }`}
                    style={{ width: `${wordProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-400">
                    {wordCount.toLocaleString()} / {selectedPostType.minWords.toLocaleString()} words
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsDetailsOpen(true)}
                      className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      disabled={!canOpenPublish}
                      onClick={handleReadyToPublish}
                      className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Publish
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      ) : null}
        </div>

        {!showChooser && !focusMode ? (
          sidebarCollapsed ? (
            <div className="hidden lg:block">
              <button
                type="button"
                onClick={toggleSidebar}
                title="Show sidebar"
                className="sticky top-[76px] flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm hover:border-emerald-200 hover:text-emerald-700"
              >
                <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="hidden lg:sticky lg:top-[76px] lg:block">
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={toggleSidebar}
                  title="Collapse sidebar"
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                  Collapse
                </button>
              </div>
              {readinessPanel}
            </div>
          )
        ) : null}
      </div>

      {isDetailsOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsDetailsOpen(false)}
            aria-label="Close details"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="write-details-title"
            className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto rounded-t-3xl bg-canvas px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4 shadow-2xl"
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-200" />
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="write-details-title" className="text-lg font-semibold text-ink">
                  Details
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Format, readiness, and publish checks.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailsOpen(false)}
                className="rounded-lg px-2 py-1 text-2xl leading-none text-gray-400 hover:bg-white hover:text-gray-600"
                aria-label="Close details"
              >
                x
              </button>
            </div>
            {readinessPanel}
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
