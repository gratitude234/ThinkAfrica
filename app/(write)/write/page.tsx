"use client";

import Link from "next/link";
import { type ReactNode, useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import ProfileGate from "@/components/ui/ProfileGate";
import type { PostReferenceRecord } from "@/lib/types";
import { type PostType } from "@/lib/utils";
import { useDraftManager, readDraftBackupRaw } from "./DraftManager";
import PublishDrawer from "./PublishDrawer";
import WriteCanvasSkeleton from "./WriteCanvasSkeleton";
import ReferencesPanel from "@/components/post/ReferencesPanel";
import { ensureDraft, savePostReferences } from "./actions";
import {
  WRITE_FORMATS,
  getResponseStarterTemplate,
  isPostType,
  isResponseIntent,
} from "./writeConfig";
import type { EditorHandle } from "@/components/editor/Editor";

const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[280px] animate-pulse py-1 lg:min-h-[380px]">
      <div className="h-5 w-full rounded bg-gray-200/50" />
      <div className="mt-3 h-5 w-3/4 rounded bg-gray-200/50" />
    </div>
  ),
});

interface DraftPayload {
  title: string;
  excerpt: string;
  content: string;
  tags: string[];
  postType: PostType;
  coverImageUrl: string;
  inResponseToId: string | null;
}

type MobileToolbarAction = "bold" | "list" | "image" | "link";

const MOBILE_TOOLBAR_BUTTONS: Array<{
  title: string;
  action: MobileToolbarAction;
  markKey?: string;
  icon: ReactNode;
}> = [
  {
    title: "Bold",
    action: "bold",
    markKey: "bold",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h8a4 4 0 010 8H6zm0 8h9a4 4 0 010 8H6z" />
      </svg>
    ),
  },
  {
    title: "List",
    action: "list",
    markKey: "bulletList",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
  },
  {
    title: "Image",
    action: "image",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: "Link",
    action: "link",
    markKey: "link",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
];

function countWords(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function getBodyPlaceholder() {
  return "Start writing your quick take, essay, or policy brief…";
}

function normalizeStarterTag(value: string | null) {
  return value?.trim().toLowerCase() || null;
}

export default function WritePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const responseToSlug = searchParams.get("response_to");
  const responseToIdParam = searchParams.get("inResponseTo");
  const typeParam = searchParams.get("type");
  const draftParam = searchParams.get("draft");
  const starterParam = searchParams.get("starter");
  const responseIntentParam = searchParams.get("responseIntent");
  const starterTag = normalizeStarterTag(searchParams.get("tag"));
  const initialPostType = isPostType(typeParam) ? typeParam : "blog";
  const {
    draftId,
    saveStatus,
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
  const [selectedResponseIntent] = useState(() =>
    isResponseIntent(responseIntentParam)
      ? responseIntentParam
      : starterParam === "response"
        ? "extend"
        : null
  );
  const editorRef = useRef<EditorHandle>(null);
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [inResponseToId, setInResponseToId] = useState<string | null>(
    responseToIdParam
  );
  const [inResponseToTitle, setInResponseToTitle] = useState<string | null>(null);
  const [inResponseToAuthor, setInResponseToAuthor] = useState<string | null>(null);
  const [responseQuote, setResponseQuote] = useState<string | null>(null);
  const [references, setReferences] = useState<PostReferenceRecord[]>([]);
  const [wordCount, setWordCount] = useState(0);
  const [isPublishDrawerOpen, setIsPublishDrawerOpen] = useState(false);
  const [isProfileGateOpen, setIsProfileGateOpen] = useState(false);
  const [publishDraftId, setPublishDraftId] = useState<string | null>(null);
  const [activeMarks, setActiveMarks] = useState<Record<string, boolean>>({});
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkPopoverUrl, setLinkPopoverUrl] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const responseStarterAppliedRef = useRef(false);
  const topicStarterAppliedRef = useRef(false);

  useEffect(() => {
    if (typeParam === "research") {
      router.replace(
        draftParam ? `/submit/research?draft=${draftParam}` : "/submit/research"
      );
    }
  }, [draftParam, router, typeParam]);

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
      if (initialData.postType === "research") {
        router.replace(
          draftParam ? `/submit/research?draft=${draftParam}` : "/submit/research"
        );
        return;
      }

      setPostType((initialData.postType as PostType) ?? "blog");
      setTitle(initialData.title);
      setExcerpt(initialData.excerpt);
      setTags(initialData.tags);
      setContent(initialData.content);
      setCoverImageUrl(initialData.coverImageUrl);
      setInResponseToId(initialData.inResponseToId);
      setWordCount(countWords(initialData.content));
    }
  }, [draftParam, initialData, router]);

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
      excerpt: overrides.excerpt ?? excerpt,
      content: overrides.content ?? content,
      tags: overrides.tags ?? tags,
      postType: overrides.postType ?? postType,
      coverImageUrl: overrides.coverImageUrl ?? coverImageUrl,
      inResponseToId: overrides.inResponseToId ?? inResponseToId,
    }),
    [title, excerpt, content, tags, postType, coverImageUrl, inResponseToId]
  );

  useEffect(() => {
    if (responseStarterAppliedRef.current) return;
    if (starterParam !== "response") return;
    if (!selectedResponseIntent) return;
    if (!inResponseToId || !inResponseToTitle) return;
    if (draftParam || initialData || localBackup) return;

    if (typeof window !== "undefined") {
      try {
        const savedBackup = readDraftBackupRaw();

        if (savedBackup) {
          const parsedBackup = JSON.parse(savedBackup) as Partial<DraftPayload>;
          const hasBackupContent =
            (parsedBackup.title ?? "").trim().length > 0 ||
            (parsedBackup.content ?? "")
              .replace(/<[^>]*>/g, " ")
              .trim().length > 0;

          if (hasBackupContent) return;
        }
      } catch {
        return;
      }
    }

    const hasManualContent =
      title.trim().length > 0 ||
      content.replace(/<[^>]*>/g, " ").trim().length > 0 ||
      tags.length > 0;

    if (hasManualContent) return;

    const template = getResponseStarterTemplate({
      parentTitle: inResponseToTitle,
      intent: selectedResponseIntent,
    });
    const nextData = getCurrentData({
      title: template.title,
      excerpt: template.excerpt,
      content: template.content,
      tags: template.tags,
      postType: "essay",
      inResponseToId,
    });

    responseStarterAppliedRef.current = true;
    setPostType("essay");
    setTitle(template.title);
    setExcerpt(template.excerpt);
    setTags(template.tags);
    setContent(template.content);
    setWordCount(countWords(template.content));
    void saveDraft(nextData);
  }, [
    content,
    draftParam,
    getCurrentData,
    inResponseToId,
    inResponseToTitle,
    initialData,
    localBackup,
    saveDraft,
    selectedResponseIntent,
    starterParam,
    tags.length,
    title,
  ]);

  useEffect(() => {
    if (topicStarterAppliedRef.current) return;
    if (starterParam !== "1" || !starterTag) return;
    if (draftParam || initialData || localBackup) return;

    if (typeof window !== "undefined") {
      try {
        const savedBackup = readDraftBackupRaw();

        if (savedBackup) {
          const parsedBackup = JSON.parse(savedBackup) as Partial<DraftPayload>;
          const hasBackupContent =
            (parsedBackup.title ?? "").trim().length > 0 ||
            (parsedBackup.content ?? "")
              .replace(/<[^>]*>/g, " ")
              .trim().length > 0;

          if (hasBackupContent) return;
        }
      } catch {
        return;
      }
    }

    const hasManualContent =
      title.trim().length > 0 ||
      content.replace(/<[^>]*>/g, " ").trim().length > 0 ||
      tags.length > 0;

    if (hasManualContent) return;

    topicStarterAppliedRef.current = true;
    const nextTags = [starterTag];
    setTags(nextTags);
    void saveDraft(getCurrentData({ tags: nextTags }));
  }, [
    content,
    draftParam,
    getCurrentData,
    initialData,
    localBackup,
    saveDraft,
    starterParam,
    starterTag,
    tags.length,
    title,
  ]);

  const handleSelectionUpdate = useCallback(() => {
    if (!editorRef.current) return;
    setActiveMarks({
      bold: editorRef.current.isActive("bold"),
      bulletList: editorRef.current.isActive("bulletList"),
      link: editorRef.current.isActive("link"),
    });
  }, []);

  const handleEditorUpdate = useCallback(
    (html: string, words: number) => {
      setContent(html);
      setWordCount(words);
      void saveDraft(getCurrentData({ content: html }));
    },
    [getCurrentData, saveDraft]
  );

  const handleReferencesChange = useCallback(
    (nextReferences: PostReferenceRecord[]) => {
      setReferences(nextReferences);
      if (publishDraftId) {
        void savePostReferences({ postId: publishDraftId, references: nextReferences });
      }
    },
    [publishDraftId]
  );

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

  const compactSaveLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? "Couldn't save"
          : "Draft";

  // Pick up a highlighted quote stored by HighlightShare when navigating from a post.
  useEffect(() => {
    if (loadingDraft) return;
    const quote = sessionStorage.getItem("write_response_quote");
    if (quote) {
      sessionStorage.removeItem("write_response_quote");
      setResponseQuote(quote);
    }
  }, [loadingDraft]);

  const canOpenPublish =
    title.trim().length > 0 &&
    wordCount > 0 &&
    !!currentUserId &&
    !loadingProfileInfo;

  const publishBlockReason = !currentUserId
    ? "Sign in to publish"
    : loadingProfileInfo
      ? "Loading..."
      : !title.trim()
        ? "Add a title first"
        : wordCount === 0
          ? "Write something first"
          : null;
  const selectedPostType =
    WRITE_FORMATS.find((item) => item.type === postType) ?? WRITE_FORMATS[0];
  const responseStarterTemplate =
    selectedResponseIntent && inResponseToTitle
      ? getResponseStarterTemplate({
          parentTitle: inResponseToTitle,
          intent: selectedResponseIntent,
        })
      : null;
  const responseIntentLabel =
    selectedResponseIntent === "challenge"
      ? "Challenge the argument"
      : selectedResponseIntent === "evidence"
        ? "Add evidence or an example"
        : selectedResponseIntent === "extend"
          ? "Extend this idea"
          : null;

  const handleReadyToPublish = async () => {
    if (!canOpenPublish) return;

    if (!profileInfo?.username) {
      setIsProfileGateOpen(true);
      return;
    }

    if (!publishDraftId) {
      const { draftId: ensuredDraftId } = await ensureDraft({
        draftId,
        title,
        excerpt,
        content,
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

  const runMobileToolbarAction = (action: MobileToolbarAction) => {
    if (action === "bold")  editorRef.current?.toggleBold();
    if (action === "list")  editorRef.current?.toggleBulletList();
    if (action === "image") editorRef.current?.triggerImageUpload();
    if (action === "link") {
      if (activeMarks.link) {
        editorRef.current?.insertLink("");
        return;
      }
      setShowLinkPopover((prev) => !prev);
      setLinkPopoverUrl("");
    }
  };

  if (loadingDraft) {
    return <WriteCanvasSkeleton />;
  }

  const hasContent =
    title.trim().length > 0 || wordCount > 0 || references.length > 0;
  const handleCloseCanvas = () => {
    if (hasContent) {
      setShowCancelConfirm(true);
      return;
    }
    router.push("/");
  };
  const uploadResearchLink = (
    <Link
      href="/submit/research"
      className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-medium text-gray-500 transition-colors hover:bg-white hover:text-gray-800"
      aria-label="Upload a research paper"
      title="Upload a research paper"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.5V4M7 9l5-5 5 5M4.5 19.5h15" />
      </svg>
      <span className="min-[480px]:hidden">PDF</span>
      <span className="hidden min-[480px]:inline">Research PDF</span>
    </Link>
  );

  return (
    <div className="mx-auto min-h-screen max-w-[1080px] px-5 pb-24 sm:px-8 lg:px-10">
      <header
        className="sticky top-0 z-30 mb-3 flex items-center justify-between gap-3 bg-canvas/95 py-3.5 backdrop-blur-sm"
        style={{ paddingTop: "max(0.875rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={handleCloseCanvas}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white hover:text-gray-800"
        >
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          {uploadResearchLink}
          <span
            className={`min-w-[44px] text-right text-xs font-medium ${saveStatus === "error" ? "text-amber-600" : "text-gray-400"}`}
            aria-live="polite"
          >
            {compactSaveLabel}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={!canOpenPublish}
            onClick={handleReadyToPublish}
            title={publishBlockReason ?? undefined}
            style={
              !canOpenPublish
                ? {
                    backgroundColor: "#E5E7EB",
                    color: "#6B7280",
                    opacity: 1,
                  }
                : undefined
            }
          >
            Publish
          </Button>
        </div>
      </header>

      {!loadingProfileInfo && currentUserId && !profileInfo?.username ? (
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

      {localBackup && !hasContent ? (
        <div className="mb-5 flex animate-slide-up items-center justify-between gap-3 rounded-xl border border-green-wash-border bg-green-wash px-4 py-3.5 text-sm">
          <span className="min-w-0 text-[13.5px] leading-5 text-ink">
            We found an unsaved draft: &quot;{localBackup.title || "Untitled"}&quot;
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={dismissBackup}
              className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-gray-500 hover:bg-white/70 hover:text-gray-700"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={restoreFromBackup}
              className="rounded-lg bg-emerald-brand px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-[#0E4B37]"
            >
              Restore
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0">
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
                {responseQuote ? (
                  <blockquote className="mt-2 border-l-2 border-emerald-400 pl-3 text-sm italic leading-relaxed text-emerald-900">
                    &ldquo;{responseQuote}&rdquo;
                  </blockquote>
                ) : responseStarterTemplate && responseIntentLabel ? (
                  <div className="mt-2 rounded-lg border border-emerald-100 bg-white/70 px-3 py-2">
                    <p className="text-xs font-semibold text-emerald-800">
                      {responseIntentLabel}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-emerald-700">
                      {responseStarterTemplate.hint}
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-xs leading-relaxed text-emerald-700">
                    Anchor your point in the original post, then add the
                    evidence, question, or counterpoint readers should consider.
                  </p>
                )}
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
            autoFocus
            onChange={(event) => {
              setTitle(event.target.value);
              saveDraft(getCurrentData({ title: event.target.value }));
            }}
            placeholder="Title"
            className="w-full border-none bg-transparent px-0 py-1 font-display text-[32px] font-semibold leading-[1.2] text-ink placeholder:text-gray-400 focus:outline-none focus:ring-0"
          />

          <Editor
            ref={editorRef}
            key={publishDraftId ?? draftId ?? (initialData ? "draft" : "empty")}
            content={content}
            placeholder={getBodyPlaceholder()}
            minWords={selectedPostType.minWords}
            onUpdate={handleEditorUpdate}
            onSelectionUpdate={handleSelectionUpdate}
            canvasMode
          />

          <div className="mt-6 lg:hidden">
            <ReferencesPanel references={references} onChange={handleReferencesChange} />
          </div>
        </main>

        <aside className="hidden lg:sticky lg:top-[92px] lg:block">
          <ReferencesPanel
            references={references}
            onChange={handleReferencesChange}
            alwaysExpanded
          />
        </aside>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white shadow-[0_-4px_16px_rgba(15,23,42,0.05)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto max-w-[1080px] px-5 sm:px-8 lg:px-10">
          <div className="lg:w-[calc(100%-340px)]">
            {showLinkPopover ? (
                <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-2 py-2">
                  <input
                    type="url"
                    autoFocus
                    value={linkPopoverUrl}
                    onChange={(e) => setLinkPopoverUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        editorRef.current?.insertLink(linkPopoverUrl);
                        setShowLinkPopover(false);
                        setLinkPopoverUrl("");
                      }
                      if (e.key === "Escape") setShowLinkPopover(false);
                    }}
                    placeholder="https://..."
                    className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      editorRef.current?.insertLink(linkPopoverUrl);
                      setShowLinkPopover(false);
                      setLinkPopoverUrl("");
                    }}
                    className="shrink-0 rounded-lg bg-emerald-brand px-3 py-1.5 text-sm font-medium text-white"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLinkPopover(false)}
                    className="shrink-0 text-sm text-gray-400"
                  >
                    Cancel
                  </button>
                </div>
            ) : null}
            <div
              className="flex items-center gap-1 overflow-x-auto py-2.5"
              style={{ scrollbarWidth: "none" }}
            >
              {MOBILE_TOOLBAR_BUTTONS.map((btn) => (
                <button
                  key={btn.title}
                  type="button"
                  title={btn.title}
                  onClick={() => runMobileToolbarAction(btn.action)}
                  className={`flex h-9 min-w-[36px] shrink-0 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition-colors ${
                    btn.markKey && activeMarks[btn.markKey]
                      ? "bg-emerald-100 text-emerald-700"
                      : "text-gray-600 hover:bg-gray-100 active:bg-gray-100"
                  }`}
                >
                  {btn.icon}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showCancelConfirm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-confirm-title"
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2 id="cancel-confirm-title" className="text-base font-semibold text-gray-900">
              Leave the editor?
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Your draft is saved automatically. Any changes since the last save may be lost.
            </p>
            <div className="mt-5 flex gap-3">
              <Button
                variant="ghost"
                type="button"
                className="flex-1"
                onClick={() => setShowCancelConfirm(false)}
              >
                Keep writing
              </Button>
              <Button
                variant="danger"
                type="button"
                className="flex-1"
                onClick={() => router.push("/")}
              >
                Leave
              </Button>
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
            content={content}
            wordCount={wordCount}
            userId={currentUserId}
            initialTags={tags}
            initialCoverImageUrl={coverImageUrl}
            initialExcerpt={excerpt}
            initialPostType={postType}
            initialReferences={references}
            inResponseTo={inResponseToId}
            onMetadataChange={handleMetadataChange}
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
