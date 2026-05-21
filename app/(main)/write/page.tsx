"use client";

import Link from "next/link";
import { type ReactNode, useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import { useDraftManager } from "./DraftManager";
import PublishDrawer from "./PublishDrawer";
import WriteReadinessPanel from "./WriteReadinessPanel";
import { ensureDraft, savePostReferences } from "./actions";
import {
  STARTER_TEMPLATES,
  WRITE_FORMATS,
  getResponseStarterTemplate,
  isPostType,
  isResponseIntent,
} from "./writeConfig";
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

type MobileToolbarAction =
  | "bold" | "italic" | "heading" | "list" | "quote"
  | "link" | "undo" | "redo";

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
    title: "Italic",
    action: "italic",
    markKey: "italic",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 4h-9M14 20H5M15 4 9 20" />
      </svg>
    ),
  },
  {
    title: "Heading",
    action: "heading",
    markKey: "heading",
    icon: <span className="text-sm font-bold">H2</span>,
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
    title: "Quote",
    action: "quote",
    markKey: "blockquote",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zm12 0c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
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
  {
    title: "Undo",
    action: "undo",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 010 16H9M3 10l4-4M3 10l4 4" />
      </svg>
    ),
  },
  {
    title: "Redo",
    action: "redo",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a8 8 0 000 16h4M21 10l-4-4M21 10l-4 4" />
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

function getBodyPlaceholder(postType: PostType) {
  if (postType === "essay") return "Open with the question your essay answers.";
  if (postType === "policy_brief") return "State the policy problem in one sentence.";
  if (postType === "research") return "Introduce your research question and methodology.";
  return "Lead with your argument — the one point you want readers to leave with.";
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
  const [selectedResponseIntent] = useState(() =>
    isResponseIntent(responseIntentParam)
      ? responseIntentParam
      : starterParam === "response"
        ? "extend"
        : null
  );
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
  const [responseQuote, setResponseQuote] = useState<string | null>(null);
  const [references, setReferences] = useState<PostReferenceRecord[]>([]);
  const [coAuthors, setCoAuthors] = useState<CoAuthorProfile[]>([]);
  const [wordCount, setWordCount] = useState(0);
  const [isPublishDrawerOpen, setIsPublishDrawerOpen] = useState(false);
  const [isProfileGateOpen, setIsProfileGateOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [publishDraftId, setPublishDraftId] = useState<string | null>(null);
  const [activeMarks, setActiveMarks] = useState<Record<string, boolean>>({});
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkPopoverUrl, setLinkPopoverUrl] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const responseStarterAppliedRef = useRef(false);
  const topicStarterAppliedRef = useRef(false);
  const chooserShownRef = useRef(false);

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
      setSubtitle(initialData.subtitle ?? "");
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

  useEffect(() => {
    if (responseStarterAppliedRef.current) return;
    if (starterParam !== "response") return;
    if (!selectedResponseIntent) return;
    if (!inResponseToId || !inResponseToTitle) return;
    if (draftParam || initialData || localBackup) return;

    if (typeof window !== "undefined") {
      try {
        const savedBackup = window.localStorage.getItem(
          "thinkafrica_draft_backup"
        );

        if (savedBackup) {
          const parsedBackup = JSON.parse(savedBackup) as Partial<DraftPayload>;
          const hasBackupContent =
            (parsedBackup.title ?? "").trim().length > 0 ||
            (parsedBackup.subtitle ?? "").trim().length > 0 ||
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
      subtitle.trim().length > 0 ||
      content.replace(/<[^>]*>/g, " ").trim().length > 0 ||
      tags.length > 0;

    if (hasManualContent) return;

    const template = getResponseStarterTemplate({
      parentTitle: inResponseToTitle,
      intent: selectedResponseIntent,
    });
    const nextData = getCurrentData({
      title: template.title,
      subtitle: template.subtitle,
      excerpt: template.excerpt,
      content: template.content,
      tags: template.tags,
      postType: "essay",
      inResponseToId,
    });

    responseStarterAppliedRef.current = true;
    setPostType("essay");
    setTitle(template.title);
    setSubtitle(template.subtitle);
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
    subtitle,
    tags.length,
    title,
  ]);

  useEffect(() => {
    if (topicStarterAppliedRef.current) return;
    if (starterParam !== "1" || !starterTag) return;
    if (draftParam || initialData || localBackup) return;

    if (typeof window !== "undefined") {
      try {
        const savedBackup = window.localStorage.getItem(
          "thinkafrica_draft_backup"
        );

        if (savedBackup) {
          const parsedBackup = JSON.parse(savedBackup) as Partial<DraftPayload>;
          const hasBackupContent =
            (parsedBackup.title ?? "").trim().length > 0 ||
            (parsedBackup.subtitle ?? "").trim().length > 0 ||
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
      subtitle.trim().length > 0 ||
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
    subtitle,
    tags.length,
    title,
  ]);

  const handleSelectionUpdate = useCallback(() => {
    if (!editorRef.current) return;
    setActiveMarks({
      bold: editorRef.current.isActive("bold"),
      italic: editorRef.current.isActive("italic"),
      heading: editorRef.current.isActive("heading", { level: 2 }),
      bulletList: editorRef.current.isActive("bulletList"),
      blockquote: editorRef.current.isActive("blockquote"),
      link: editorRef.current.isActive("link"),
    });
  }, []);

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

  const hasExistingContext = Boolean(
    draftParam || typeParam || starterParam || responseToSlug ||
    responseToIdParam || responseIntentParam
  );

  // Show format chooser automatically for brand-new writes (no existing draft/context).
  // Only [loadingDraft] in deps — hasExistingContext/initialData/localBackup are intentionally
  // read once when loading resolves, not re-checked on every change.
  useEffect(() => {
    if (loadingDraft) return;
    if (chooserShownRef.current) return;
    chooserShownRef.current = true;
    if (!hasExistingContext && !initialData && !localBackup) {
      setShowChooser(true);
    }
  }, [loadingDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pick up a highlighted quote stored by HighlightShare when navigating from a post.
  useEffect(() => {
    if (loadingDraft) return;
    const quote = sessionStorage.getItem("write_response_quote");
    if (quote) {
      sessionStorage.removeItem("write_response_quote");
      setResponseQuote(quote);
    }
  }, [loadingDraft]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const wordProgress = Math.min(
    100,
    (wordCount / selectedPostType.minWords) * 100
  );
  const estimatedReadTime = Math.max(1, Math.ceil(wordCount / 200));
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
    if (templateType === "research") {
      router.push("/submit/research");
      return;
    }

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
    if (action === "bold")    editorRef.current?.toggleBold();
    if (action === "italic")  editorRef.current?.toggleItalic();
    if (action === "heading") editorRef.current?.toggleH2();
    if (action === "list")    editorRef.current?.toggleBulletList();
    if (action === "quote")   editorRef.current?.toggleBlockquote();
    if (action === "undo")    editorRef.current?.undo();
    if (action === "redo")    editorRef.current?.redo();
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
    return (
      <div className="mx-auto max-w-6xl animate-pulse pb-24 lg:pb-0">
        <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="h-5 w-28 rounded bg-gray-200" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-16 rounded-lg bg-gray-200" />
            <div className="h-8 w-32 rounded-lg bg-gray-200" />
          </div>
        </div>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="h-14 w-full rounded-xl bg-gray-100" />
            <div className="h-12 w-3/4 rounded bg-gray-200" />
            <div className="h-7 w-1/2 rounded bg-gray-100" />
            <div className="h-96 w-full rounded-lg bg-gray-100" />
          </div>
          <div className="hidden space-y-3 lg:block">
            <div className="h-48 w-full rounded-xl bg-gray-100" />
            <div className="h-32 w-full rounded-xl bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  const showStructureStrip =
    starterParam === "1" || (!draftParam && wordCount === 0);
  const readinessPanel = (
    <WriteReadinessPanel
      postType={postType}
      title={title}
      subtitle={subtitle}
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
      onChangeFormat={() => setShowChooser(true)}
    />
  );

  return (
    <div className={`mx-auto max-w-6xl pb-16 lg:pb-0 ${focusMode ? "focus-mode" : ""}`}>
      {focusMode ? (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-3 rounded-full border border-gray-200 bg-white/90 px-4 py-2 shadow-md backdrop-blur-sm">
          <span className={`text-xs ${saveStatus === "error" ? "text-amber-600" : "text-gray-500"}`}>
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
        <>
          {/* Mobile header — single compact row */}
          <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3 lg:hidden">
            <button
              type="button"
              onClick={() => {
                const hasContent = title.trim().length > 0 || wordCount > 0;
                if (hasContent) { setShowCancelConfirm(true); return; }
                router.push("/");
              }}
              className="text-sm font-medium text-gray-500"
            >
              Cancel
            </button>
            <Link href="/" className="text-sm font-semibold text-gray-900">
              ThinkAfrica
            </Link>
            <button
              type="button"
              disabled={!canOpenPublish}
              onClick={handleReadyToPublish}
              className="text-sm font-semibold text-emerald-600 disabled:text-gray-300"
            >
              Publish
            </button>
          </div>
          {/* Desktop header */}
          <div className="mb-6 hidden items-center justify-between border-b border-gray-100 pb-4 lg:flex">
            <Link href="/" className="text-sm font-semibold tracking-wide text-gray-900">
              ThinkAfrica
            </Link>
            <p className={`text-xs ${saveStatus === "error" ? "text-amber-600" : "text-gray-500"}`}>
              {saveStatusText}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFocusMode(true)}
                title="Focus mode — hide distractions"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-emerald-200 hover:text-emerald-700"
              >
                Focus
              </button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  const hasContent = title.trim().length > 0 || wordCount > 0;
                  if (hasContent) { setShowCancelConfirm(true); return; }
                  router.push("/");
                }}
              >
                Cancel
              </Button>
              <div className="group relative">
                <Button
                  type="button"
                  size="lg"
                  disabled={!canOpenPublish}
                  onClick={handleReadyToPublish}
                >
                  Publish
                </Button>
                {!canOpenPublish && publishBlockReason ? (
                  <div className="pointer-events-none absolute bottom-full right-0 mb-2 hidden whitespace-nowrap rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white shadow-lg group-hover:block">
                    {publishBlockReason}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </>
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
                    if (type.type === "research") {
                      router.push("/submit/research");
                      return;
                    }

                    setPostType(type.type);
                    setShowChooser(false);
                    if (draftId) {
                      void saveDraft(getCurrentData({ postType: type.type }));
                    }
                  }}
                  className={`rounded-xl border bg-white p-5 text-left transition-[border-color,box-shadow,ring-color] hover:border-emerald-300 hover:ring-2 hover:ring-emerald-100 ${
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
                      <p className="mt-3 hidden text-xs font-semibold uppercase tracking-wide text-emerald-700 sm:block">
                        {type.signalLabel}
                      </p>
                      <p className="mt-1 hidden text-sm leading-6 text-gray-600 sm:block">
                        {type.portfolioValue}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-gray-600">
                      min. {type.minWords.toLocaleString()} words
                    </span>
                  </div>
                  <div className="hidden flex-wrap gap-2 text-xs text-gray-500 sm:flex">
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
                    Start with one clear point
                  </p>
                  <p className="text-xs leading-relaxed text-emerald-800">
                    A strong quick take only needs a point, why it matters, one
                    example, and a question for readers.
                  </p>
                </div>
                {draftId ? (
                  <p className="text-xs font-medium text-emerald-700">
                    Draft saved
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <Editor
            ref={editorRef}
            key={publishDraftId ?? draftId ?? (initialData ? "draft" : "empty")}
            content={content}
            placeholder={getBodyPlaceholder(postType)}
            minWords={selectedPostType.minWords}
            postType={postType}
            references={references}
            onReferencesChange={setReferences}
            onUpdate={handleEditorUpdate}
            onSelectionUpdate={handleSelectionUpdate}
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
            <div
              className="sticky bottom-0 z-20 border-t border-gray-100 bg-white shadow-[0_-4px_12px_rgba(15,23,42,0.06)] lg:hidden"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              {/* Link URL input — slides in above toolbar when link button tapped */}
              {showLinkPopover ? (
                <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-3 py-2">
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
              {/* Single-row toolbar: formatting icons (scrollable) + word count + details + publish */}
              <div className="flex items-center gap-0.5 px-2 py-1.5">
                <div
                  className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
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
                          : "text-gray-600 active:bg-gray-100"
                      }`}
                    >
                      {btn.icon}
                    </button>
                  ))}
                </div>
                <div className="flex shrink-0 items-center gap-1.5 border-l border-gray-100 pl-2">
                  <span className="tabular-nums text-xs text-gray-400">
                    {wordCount.toLocaleString()}w
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsDetailsOpen(true)}
                    title="Details"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 active:bg-gray-100"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={!canOpenPublish}
                    onClick={handleReadyToPublish}
                    className="rounded-lg bg-emerald-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Publish
                  </button>
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
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-gray-600"
                aria-label="Close details"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {readinessPanel}
          </div>
        </div>
      ) : null}

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
