"use client";

import Link from "next/link";
import {
  type ReactNode,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import ProfileGate from "@/components/ui/ProfileGate";
import type { PostReferenceRecord } from "@/lib/types";
import { type PostType } from "@/lib/utils";
import type { ArticleFormat } from "@/lib/contentModel";
import { getPostDisplayTitle, getPostMetadataTitle } from "@/lib/postDisplay";
import { useDraftManager } from "./DraftManager";
import PublishDrawer from "./PublishDrawer";
import CoverImageDialog from "./CoverImageDialog";
import WriteCanvasSkeleton from "./WriteCanvasSkeleton";
import DraftSignalBar from "./DraftSignalBar";
import ReferencesPanel from "@/components/post/ReferencesPanel";
import type { CoAuthorProfile } from "@/components/collaboration/CoAuthorPicker";
import { savePostReferences } from "./actions";
import {
  WRITE_FORMATS,
  getPublishGateCopy,
  getResponseStarterTemplate,
  isResponseIntent,
  resolveWriteRedirectPath,
} from "./writeConfig";
import type { EditorHandle } from "@/components/editor/Editor";

const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[280px] animate-pulse motion-reduce:animate-none py-1 lg:min-h-[380px]">
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
  articleFormat: ArticleFormat | null;
  coverImageUrl: string;
  inResponseToId: string | null;
}

interface WriterProfile {
  full_name: string | null;
  username: string | null;
  university: string | null;
}

type EditorToolbarAction =
  | "bold"
  | "italic"
  | "heading"
  | "list"
  | "orderedList"
  | "quote"
  | "image"
  | "link"
  | "undo"
  | "redo";

interface ToolbarButtonDefinition {
  title: string;
  action: EditorToolbarAction;
  markKey?: string;
  icon: ReactNode;
}

const CORE_TOOLBAR_BUTTONS: ToolbarButtonDefinition[] = [
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
    title: "Insert image in article",
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

const DESKTOP_TOOLBAR_BUTTONS: ToolbarButtonDefinition[] = [
  CORE_TOOLBAR_BUTTONS[0],
  {
    title: "Italic",
    action: "italic",
    markKey: "italic",
    icon: <span className="font-display text-base italic leading-none">I</span>,
  },
  {
    title: "Heading",
    action: "heading",
    markKey: "heading",
    icon: <span className="text-xs font-semibold leading-none">H2</span>,
  },
  CORE_TOOLBAR_BUTTONS[1],
  {
    title: "Numbered list",
    action: "orderedList",
    markKey: "orderedList",
    icon: (
      <span className="text-xs font-semibold leading-none" aria-hidden="true">
        1.
      </span>
    ),
  },
  {
    title: "Quote",
    action: "quote",
    markKey: "blockquote",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 8H6.75A2.75 2.75 0 004 10.75v1.5A2.75 2.75 0 006.75 15H8v2.5M20 8h-2.75a2.75 2.75 0 00-2.75 2.75v1.5A2.75 2.75 0 0017.25 15h1.25v2.5" />
      </svg>
    ),
  },
  CORE_TOOLBAR_BUTTONS[2],
  CORE_TOOLBAR_BUTTONS[3],
  {
    title: "Undo",
    action: "undo",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 8 5 12l4 4M6 12h7a6 6 0 0 1 6 6" />
      </svg>
    ),
  },
  {
    title: "Redo",
    action: "redo",
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="m15 8 4 4-4 4m3-4h-7a6 6 0 0 0-6 6" />
      </svg>
    ),
  },
];

// Long-form writing keeps the same capabilities on touch devices. The
// toolbar scrolls horizontally, so parity does not crowd the canvas.
const MOBILE_TOOLBAR_BUTTONS = DESKTOP_TOOLBAR_BUTTONS;

function countWords(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function getBodyPlaceholder() {
  return "Start writing your article…";
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
  // "kind=article" is the preferred, stable URL for this composer (it's the
  // link the Post composer's "Write an article" path uses -- see
  // app/(write)/create/post/PostComposerForm.tsx); legacy
  // `type=essay`/`type=policy_brief` links keep
  // working for backward compatibility -- both just land on the same
  // Article composer, since which legacy value applies to a *new* draft is
  // never user-choosable here anymore (see write/actions.ts).
  const kindParam = searchParams.get("kind");
  const draftParam = searchParams.get("draft");
  const starterParam = searchParams.get("starter");
  const responseIntentParam = searchParams.get("responseIntent");
  const starterTag = normalizeStarterTag(searchParams.get("tag"));
  const returnToParam = searchParams.get("returnTo");
  const returnDestination =
    returnToParam?.startsWith("/") && !returnToParam.startsWith("//")
      ? returnToParam
      : responseToSlug
        ? `/post/${encodeURIComponent(responseToSlug)}`
        : "/";
  const {
    draftId,
    saveStatus,
    saveError,
    loadError,
    saveDraft,
    flushDraft,
    editorSessionKey,
    loadedDraftId,
    initialData,
    loadingDraft,
    loadingBackup,
    localBackup,
    restoreFromBackup,
    dismissBackup,
    clearLocalBackup,
  } = useDraftManager();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profileInfo, setProfileInfo] = useState<WriterProfile | null>(null);
  const [loadingProfileInfo, setLoadingProfileInfo] = useState(true);
  // Never seeded from a URL param -- a legacy `type=`/`kind=` value must not
  // drive this composer's displayed classification (word-count target,
  // publish-label, review messaging) for what is actually a brand-new
  // generic Article. It is only ever set from `initialData`, i.e. once a
  // *confirmed, still-editable* legacy draft has actually loaded.
  const [postType, setPostType] = useState<PostType>("essay");
  // Phase 4A: optional Article genre, lifted here (mirroring postType)
  // rather than owned locally by PublishDrawer, so a selection survives
  // closing/reopening the drawer within the same session -- see
  // handleMetadataChange and PublishDrawer's initialArticleFormat prop.
  // Like postType, only ever set from initialData once a real draft has
  // loaded, never from a URL param.
  const [articleFormat, setArticleFormat] = useState<ArticleFormat | null>(null);
  const selectedResponseIntent =
    isResponseIntent(responseIntentParam)
      ? responseIntentParam
      : starterParam === "response"
        ? "extend"
        : null;
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
  /** False when the title above is the derived "Post by {author}" stand-in, in
   *  which case the separate "by @{author}" line would name them twice. */
  const [parentHasOwnTitle, setParentHasOwnTitle] = useState(true);
  const [inResponseToAuthor, setInResponseToAuthor] = useState<string | null>(null);
  const [responseQuote, setResponseQuote] = useState<string | null>(null);
  const [references, setReferences] = useState<PostReferenceRecord[]>([]);
  const [coAuthors, setCoAuthors] = useState<CoAuthorProfile[]>([]);
  const [metadataStatus, setMetadataStatus] = useState<
    "loading" | "ready" | "error"
  >(draftParam ? "loading" : "ready");
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataReloadKey, setMetadataReloadKey] = useState(0);
  const [referenceSaveStatus, setReferenceSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [reviewPreparing, setReviewPreparing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [citationNotice, setCitationNotice] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [isPublishDrawerOpen, setIsPublishDrawerOpen] = useState(false);
  const [isCoverDialogOpen, setIsCoverDialogOpen] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [isProfileGateOpen, setIsProfileGateOpen] = useState(false);
  const [activeMarks, setActiveMarks] = useState<Record<string, boolean>>({});
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkPopoverUrl, setLinkPopoverUrl] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [exitSaving, setExitSaving] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);
  // Leaving the canvas loads the home feed, which is server-rendered. Track
  // it so the exit controls can show they're working instead of sitting
  // inert while the feed is fetched.
  const [isLeaving, startLeaving] = useTransition();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const responseStarterAppliedRef = useRef(false);
  const topicStarterAppliedRef = useRef(false);
  const reviewPublishInFlightRef = useRef(false);
  const referenceSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const referenceSaveVersionRef = useRef(0);
  const referenceSavePromiseRef = useRef<
    Promise<{ error: string | null }> | null
  >(null);
  const latestReferencesRef = useRef<PostReferenceRecord[]>([]);
  const referencesDirtyRef = useRef(false);
  const previousEditorSessionKeyRef = useRef(editorSessionKey);
  const activeEditorSessionKeyRef = useRef(editorSessionKey);
  const exitDialogRef = useRef<HTMLDivElement>(null);
  const exitKeepWritingRef = useRef<HTMLButtonElement>(null);
  const exitTriggerRef = useRef<HTMLElement | null>(null);
  const exitBusyRef = useRef(false);

  useEffect(() => {
    exitBusyRef.current = exitSaving || isLeaving;
  }, [exitSaving, isLeaving]);

  useEffect(() => {
    if (!showCancelConfirm) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      exitKeepWritingRef.current?.focus();
    });

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      const dialog = exitDialogRef.current;
      if (!dialog) return;

      if (event.key === "Escape") {
        if (exitBusyRef.current) return;
        event.preventDefault();
        setShowCancelConfirm(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("hidden"));

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      const trigger = exitTriggerRef.current;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [showCancelConfirm]);

  useEffect(() => {
    const redirectPath = resolveWriteRedirectPath({ typeParam, kindParam, draftParam });
    if (redirectPath) {
      router.replace(redirectPath);
    }
  }, [draftParam, kindParam, router, typeParam]);

  useLayoutEffect(() => {
    activeEditorSessionKeyRef.current = editorSessionKey;
    if (previousEditorSessionKeyRef.current === editorSessionKey) return;
    previousEditorSessionKeyRef.current = editorSessionKey;

    if (referenceSaveTimerRef.current) {
      clearTimeout(referenceSaveTimerRef.current);
      referenceSaveTimerRef.current = null;
    }
    referenceSaveVersionRef.current += 1;
    referenceSavePromiseRef.current = null;
    latestReferencesRef.current = [];
    referencesDirtyRef.current = false;
    responseStarterAppliedRef.current = false;
    topicStarterAppliedRef.current = false;
    reviewPublishInFlightRef.current = false;

    setPostType("essay");
    setArticleFormat(null);
    setTitle("");
    setExcerpt("");
    setTags([]);
    setContent("");
    setCoverImageUrl("");
    setInResponseToId(responseToIdParam);
    setInResponseToTitle(null);
    setParentHasOwnTitle(true);
    setInResponseToAuthor(null);
    setResponseQuote(null);
    setReferences([]);
    setCoAuthors([]);
    setMetadataStatus(draftParam ? "loading" : "ready");
    setMetadataError(null);
    setReferenceSaveStatus("idle");
    setReviewPreparing(false);
    setReviewError(null);
    setCitationNotice("");
    setWordCount(0);
    setIsPublishDrawerOpen(false);
    setIsCoverDialogOpen(false);
    setCoverUploading(false);
    setIsProfileGateOpen(false);
    setActiveMarks({});
    setShowLinkPopover(false);
    setLinkPopoverUrl("");
    setShowCancelConfirm(false);
    setExitSaving(false);
    setExitError(null);
    setShowMobileMenu(false);
  }, [draftParam, editorSessionKey, responseToIdParam]);

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

      setPostType((initialData.postType as PostType) ?? "essay");
      setArticleFormat(initialData.articleFormat);
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
    let cancelled = false;

    async function loadParentPost() {
      if (responseToIdParam) {
        const { data: parentPost } = await supabase
          .from("posts")
          .select("id, title, profiles!posts_author_id_fkey(username)")
          .eq("id", responseToIdParam)
          .eq("status", "published")
          .single();

        if (cancelled) return;

        if (parentPost) {
          const authorProfile = Array.isArray(parentPost.profiles)
            ? parentPost.profiles[0]
            : (parentPost.profiles as { username: string } | null);
          setInResponseToId(parentPost.id);
          setInResponseToTitle(getPostMetadataTitle(parentPost, authorProfile));
          setParentHasOwnTitle(getPostDisplayTitle(parentPost) !== null);
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

        if (cancelled) return;

        if (parentPost) {
          const authorProfile = Array.isArray(parentPost.profiles)
            ? parentPost.profiles[0]
            : (parentPost.profiles as { username: string } | null);
          setInResponseToId(parentPost.id);
          setInResponseToTitle(getPostMetadataTitle(parentPost, authorProfile));
          setParentHasOwnTitle(getPostDisplayTitle(parentPost) !== null);
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

        if (cancelled) return;

        if (parentPost) {
          const authorProfile = Array.isArray(parentPost.profiles)
            ? parentPost.profiles[0]
            : (parentPost.profiles as { username: string } | null);
          setInResponseToId(parentPost.id);
          setInResponseToTitle(getPostMetadataTitle(parentPost, authorProfile));
          setParentHasOwnTitle(getPostDisplayTitle(parentPost) !== null);
          setInResponseToAuthor(authorProfile?.username ?? null);
          return;
        }

        setInResponseToId(null);
      }

      setInResponseToTitle(null);
      setInResponseToAuthor(null);
    }

    void loadParentPost();
    return () => {
      cancelled = true;
    };
  }, [inResponseToId, responseToIdParam, responseToSlug]);

  useEffect(() => {
    if (!draftId) {
      if (!loadingDraft) {
        setReferences([]);
        setCoAuthors([]);
        setMetadataStatus("ready");
        setMetadataError(null);
      }
      return;
    }

    if (loadingDraft) {
      setMetadataStatus("loading");
      return;
    }

    // A draft first created in the current editor session has no server
    // metadata to hydrate; its local source/collaborator state is authoritative.
    if (loadedDraftId !== draftId) {
      setMetadataStatus("ready");
      setMetadataError(null);
      return;
    }

    if (!currentUserId) {
      setMetadataStatus("loading");
      return;
    }

    let cancelled = false;
    setMetadataStatus("loading");
    setMetadataError(null);
    const supabase = createClient();
    void Promise.all([
      supabase
        .from("post_references")
        .select("*")
        .eq("post_id", draftId)
        .order("display_order", { ascending: true }),
      supabase
        .from("post_authors")
        .select(
          "user_id, display_order, profile:profiles!post_authors_user_id_fkey(id, username, full_name, university, field_of_study)"
        )
        .eq("post_id", draftId)
        .order("display_order", { ascending: true }),
    ]).then(([referenceResult, authorResult]) => {
      if (cancelled) return;
      if (referenceResult.error || authorResult.error) {
        setMetadataStatus("error");
        setMetadataError(
          "We couldn't load this draft's sources and collaborators. Nothing was changed."
        );
        return;
      }

      setReferences(
        (referenceResult.data as PostReferenceRecord[] | null) ?? []
      );
      latestReferencesRef.current =
        (referenceResult.data as PostReferenceRecord[] | null) ?? [];
      referencesDirtyRef.current = false;
      const normalizedAuthors: CoAuthorProfile[] = (
        (authorResult.data as Array<Record<string, unknown>> | null) ?? []
      )
        .filter((row) => row.user_id !== currentUserId)
        .flatMap((row): CoAuthorProfile[] => {
          const rawProfile = Array.isArray(row.profile)
            ? row.profile[0]
            : row.profile;
          const profile = rawProfile as Partial<CoAuthorProfile> | null;
          if (!profile?.username) return [];
          return [
            {
              id: String(row.user_id),
              username: profile.username,
              full_name: profile.full_name ?? null,
              university: profile.university ?? null,
              field_of_study: profile.field_of_study ?? null,
            },
          ];
        });
      setCoAuthors(normalizedAuthors);
      setMetadataStatus("ready");
      setReferenceSaveStatus("saved");
    });

    return () => {
      cancelled = true;
    };
  }, [currentUserId, draftId, loadedDraftId, loadingDraft, metadataReloadKey]);

  const getCurrentData = useCallback(
    (overrides: Partial<DraftPayload> = {}): DraftPayload => ({
      title: overrides.title ?? title,
      excerpt: overrides.excerpt ?? excerpt,
      content: overrides.content ?? content,
      tags: overrides.tags ?? tags,
      postType: overrides.postType ?? postType,
      articleFormat: "articleFormat" in overrides ? (overrides.articleFormat ?? null) : articleFormat,
      coverImageUrl: overrides.coverImageUrl ?? coverImageUrl,
      inResponseToId: overrides.inResponseToId ?? inResponseToId,
    }),
    [title, excerpt, content, tags, postType, articleFormat, coverImageUrl, inResponseToId]
  );

  useEffect(() => {
    if (responseStarterAppliedRef.current) return;
    if (loadingBackup) return;
    if (starterParam !== "response") return;
    if (!selectedResponseIntent) return;
    if (!inResponseToId || !inResponseToTitle) return;
    if (draftParam || initialData || localBackup) return;

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
    loadingBackup,
    saveDraft,
    selectedResponseIntent,
    starterParam,
    tags.length,
    title,
  ]);

  useEffect(() => {
    if (topicStarterAppliedRef.current) return;
    if (loadingBackup) return;
    if (starterParam !== "1" || !starterTag) return;
    if (draftParam || initialData || localBackup) return;

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
    loadingBackup,
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
      italic: editorRef.current.isActive("italic"),
      heading: editorRef.current.isActive("heading", { level: 2 }),
      bulletList: editorRef.current.isActive("bulletList"),
      orderedList: editorRef.current.isActive("orderedList"),
      blockquote: editorRef.current.isActive("blockquote"),
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

  const runReferenceSave = useCallback(
    async (
      postId: string,
      nextReferences: PostReferenceRecord[],
      version: number
    ) => {
      const operation = savePostReferences({
        postId,
        references: nextReferences,
      });
      referenceSavePromiseRef.current = operation;
      const result = await operation;
      if (referenceSavePromiseRef.current === operation) {
        referenceSavePromiseRef.current = null;
      }
      if (version === referenceSaveVersionRef.current) {
        setReferenceSaveStatus(result.error ? "error" : "saved");
        if (result.error) {
          setReviewError(`Sources were not saved: ${result.error}`);
        } else {
          referencesDirtyRef.current = false;
        }
      }
      return result;
    },
    [setReferenceSaveStatus, setReviewError]
  );

  const flushPendingReferences = useCallback(
    async (postId: string) => {
      if (referenceSaveTimerRef.current) {
        clearTimeout(referenceSaveTimerRef.current);
        referenceSaveTimerRef.current = null;
      }

      const pendingSave = referenceSavePromiseRef.current;
      if (pendingSave) await pendingSave;
      if (!referencesDirtyRef.current) return { error: null as string | null };

      const version = ++referenceSaveVersionRef.current;
      setReferenceSaveStatus("saving");
      return runReferenceSave(postId, latestReferencesRef.current, version);
    },
    [runReferenceSave, setReferenceSaveStatus]
  );

  const handleReferencesChange = useCallback(
    (nextReferences: PostReferenceRecord[]) => {
      setReferences(nextReferences);
      latestReferencesRef.current = nextReferences;
      referencesDirtyRef.current = true;
      setReviewError(null);
      referenceSaveVersionRef.current += 1;
      if (referenceSaveTimerRef.current) {
        clearTimeout(referenceSaveTimerRef.current);
        referenceSaveTimerRef.current = null;
      }
      if (!draftId || metadataStatus !== "ready") return;

      setReferenceSaveStatus("saving");
      referenceSaveTimerRef.current = setTimeout(() => {
        referenceSaveTimerRef.current = null;
        void flushPendingReferences(draftId);
      }, 900);
    },
    [draftId, flushPendingReferences, metadataStatus]
  );

  useEffect(
    () => () => {
      if (referenceSaveTimerRef.current) {
        clearTimeout(referenceSaveTimerRef.current);
        referenceSaveTimerRef.current = null;
      }
    },
    []
  );

  const handleMetadataChange = useCallback(
    (changes: {
      postType?: PostType;
      articleFormat?: ArticleFormat | null;
      tags?: string[];
      coverImageUrl?: string;
      excerpt?: string;
      references?: PostReferenceRecord[];
      coAuthors?: CoAuthorProfile[];
      inResponseToId?: string | null;
    }) => {
      if (changes.postType) setPostType(changes.postType);
      // "articleFormat" in changes (not a truthiness/undefined check) so an
      // explicit null -- the user picking "General" to clear a genre -- is
      // applied, not ignored the way `if (changes.articleFormat)` would.
      if ("articleFormat" in changes) setArticleFormat(changes.articleFormat ?? null);
      if (changes.tags) setTags(changes.tags);
      if (typeof changes.coverImageUrl === "string") {
        setCoverImageUrl(changes.coverImageUrl);
      }
      if (typeof changes.excerpt === "string") {
        setExcerpt(changes.excerpt);
      }
      if (changes.references) {
        handleReferencesChange(changes.references);
      }
      if (changes.coAuthors) {
        setCoAuthors(changes.coAuthors);
      }
      if ("inResponseToId" in changes) {
        setInResponseToId(changes.inResponseToId ?? null);
      }

      void saveDraft(
        getCurrentData({
          postType: changes.postType,
          ...("articleFormat" in changes ? { articleFormat: changes.articleFormat ?? null } : {}),
          tags: changes.tags,
          coverImageUrl: changes.coverImageUrl,
          excerpt: changes.excerpt,
          inResponseToId: changes.inResponseToId,
        })
      );
    },
    [
      getCurrentData,
      handleReferencesChange,
      saveDraft,
      setArticleFormat,
      setCoAuthors,
      setCoverImageUrl,
      setExcerpt,
      setInResponseToId,
      setPostType,
      setTags,
    ]
  );

  const closeCoverDialog = useCallback(() => setIsCoverDialogOpen(false), []);

  const compactSaveLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? "Couldn't save"
          : "Draft";

  const coverButtonLabel = coverUploading
    ? "Uploading…"
    : coverImageUrl
      ? "Cover added ✓"
      : "Add cover";
  const coverButtonAriaLabel = coverUploading
    ? "Cover image uploading"
    : coverImageUrl
      ? "Cover image added. Change or remove the cover image"
      : "Add a cover image";

  // Pick up a highlighted quote stored by HighlightShare when navigating from a post.
  useEffect(() => {
    if (loadingDraft) return;
    const quote = sessionStorage.getItem("write_response_quote");
    if (quote) {
      sessionStorage.removeItem("write_response_quote");
      setResponseQuote(quote);
    }
  }, [editorSessionKey, loadingDraft]);

  useEffect(() => {
    if (!showMobileMenu) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowMobileMenu(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showMobileMenu]);

  useEffect(() => {
    if (!citationNotice) return;
    const timer = setTimeout(() => setCitationNotice(""), 2500);
    return () => clearTimeout(timer);
  }, [citationNotice]);

  const canOpenPublish =
    title.trim().length > 0 &&
    wordCount > 0 &&
    !!currentUserId &&
    !loadingProfileInfo &&
    metadataStatus === "ready" &&
    !reviewPreparing;

  const publishBlockReason = !currentUserId
    ? "Sign in to publish"
    : loadingProfileInfo
      ? "Loading..."
      : metadataStatus === "loading"
        ? "Loading sources and collaborators..."
        : metadataStatus === "error"
          ? "Reload sources and collaborators first"
          : reviewPreparing
            ? "Preparing publication review..."
      : !title.trim()
        ? "Add a title first"
        : wordCount === 0
          ? "Write something first"
          : null;
  const selectedPostType =
    WRITE_FORMATS.find((item) => item.type === postType) ?? WRITE_FORMATS[0];
  const publishGateCopy = getPublishGateCopy(postType);
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

  const handleReadyToPublish = async (completedProfile?: WriterProfile) => {
    if (!canOpenPublish || reviewPreparing) return;
    const requestedSessionKey = activeEditorSessionKeyRef.current;
    const publishingProfile = completedProfile ?? profileInfo;

    if (!publishingProfile?.username) {
      setIsProfileGateOpen(true);
      return;
    }

    setReviewPreparing(true);
    setReviewError(null);
    try {
      const ensuredDraftId = await flushDraft(getCurrentData());
      if (requestedSessionKey !== activeEditorSessionKeyRef.current) return;
      if (!ensuredDraftId) {
        setReviewError(saveError || "We couldn't save this Article. Try again before publishing.");
        return;
      }

      const referenceResult = await flushPendingReferences(ensuredDraftId);
      if (requestedSessionKey !== activeEditorSessionKeyRef.current) return;
      if (referenceResult.error) {
        setReferenceSaveStatus("error");
        setReviewError(`Sources were not saved: ${referenceResult.error}`);
        return;
      }

      setReferenceSaveStatus("saved");
      setIsPublishDrawerOpen(true);
    } finally {
      if (requestedSessionKey === activeEditorSessionKeyRef.current) {
        setReviewPreparing(false);
      }
    }
  };

  const handleReviewPublishFromCover = () => {
    if (reviewPublishInFlightRef.current) return;
    reviewPublishInFlightRef.current = true;
    closeCoverDialog();
    void handleReadyToPublish().finally(() => {
      reviewPublishInFlightRef.current = false;
    });
  };

  const runToolbarAction = (action: EditorToolbarAction) => {
    if (action === "bold")  editorRef.current?.toggleBold();
    if (action === "italic") editorRef.current?.toggleItalic();
    if (action === "heading") editorRef.current?.toggleH2();
    if (action === "list")  editorRef.current?.toggleBulletList();
    if (action === "orderedList") editorRef.current?.toggleOrderedList();
    if (action === "quote") editorRef.current?.toggleBlockquote();
    if (action === "image") editorRef.current?.triggerImageUpload();
    if (action === "undo") editorRef.current?.undo();
    if (action === "redo") editorRef.current?.redo();
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

  if (loadError && draftParam) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-xl items-center px-5 py-12">
        <div className="w-full rounded-2xl border border-amber-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
            Draft unavailable
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-ink">
            We did not open a blank editor over your draft
          </h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-gray-600">
            {loadError}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white"
            >
              View your drafts
            </Link>
            <Link
              href="/write"
              className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700"
            >
              Start a new Article
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const hasContent =
    title.trim().length > 0 ||
    wordCount > 0 ||
    excerpt.trim().length > 0 ||
    tags.length > 0 ||
    references.length > 0 ||
    coAuthors.length > 0 ||
    Boolean(coverImageUrl);
  const handleCloseCanvas = () => {
    if (hasContent) {
      if (document.activeElement instanceof HTMLElement) {
        exitTriggerRef.current = document.activeElement;
      }
      setExitError(null);
      setShowCancelConfirm(true);
      return;
    }
    startLeaving(() => {
      router.push(returnDestination);
    });
  };
  const leaveWithDeviceBackup = () => {
    startLeaving(() => router.push(returnDestination));
  };
  const handleSaveAndLeave = async () => {
    if (exitSaving) return;
    const requestedSessionKey = activeEditorSessionKeyRef.current;
    setExitSaving(true);
    setExitError(null);
    try {
      const ensuredDraftId = title.trim()
        ? await flushDraft(getCurrentData())
        : draftId;
      if (requestedSessionKey !== activeEditorSessionKeyRef.current) return;

      if (title.trim() && !ensuredDraftId) {
        setExitError(
          "Cloud save failed. Your scoped device backup is safe; retry or leave with that backup."
        );
        return;
      }

      if (!ensuredDraftId && referencesDirtyRef.current) {
        setExitError("Add a title before leaving so your sources can be saved with this Article.");
        return;
      }

      if (ensuredDraftId) {
        const referenceResult = await flushPendingReferences(ensuredDraftId);
        if (requestedSessionKey !== activeEditorSessionKeyRef.current) return;
        if (referenceResult.error) {
          setExitError(`Sources were not saved: ${referenceResult.error}`);
          return;
        }
      }

      leaveWithDeviceBackup();
    } catch {
      if (requestedSessionKey === activeEditorSessionKeyRef.current) {
        setExitError(
          "We couldn't finish saving this Article. Your writing remains protected on this device."
        );
      }
    } finally {
      if (requestedSessionKey === activeEditorSessionKeyRef.current) {
        setExitSaving(false);
      }
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-[1240px] px-5 pb-28 sm:px-8 lg:px-8 lg:pb-12 xl:px-10">
      <header
        className="sticky top-0 z-30 mb-3 border-b border-transparent bg-canvas/95 py-3.5 backdrop-blur-sm lg:relative lg:mb-7 lg:border-gray-200/80"
        style={{ paddingTop: "max(0.875rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={handleCloseCanvas}
              aria-label="Close editor"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white hover:text-gray-800 lg:h-9 lg:w-9"
            >
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="hidden lg:block">
              <p className="text-sm font-semibold text-ink">Write an Article</p>
              <p className="mt-0.5 text-xs text-gray-400">
                Long-form, with a title. Publishes immediately.
              </p>
            </div>
            <span
              className={`min-w-0 truncate text-xs font-medium lg:hidden ${saveStatus === "error" ? "text-amber-600" : "text-gray-400"}`}
              aria-live="polite"
            >
              <span
                aria-hidden="true"
                className={`mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle ${
                  saveStatus === "saving"
                    ? "animate-pulse motion-reduce:animate-none bg-amber-400"
                    : saveStatus === "error"
                      ? "bg-red-500"
                      : saveStatus === "saved"
                        ? "bg-emerald-500"
                        : "bg-gray-300"
                }`}
              />
              {compactSaveLabel}
            </span>
          </div>

          <div className="hidden shrink-0 items-center gap-2.5 lg:flex">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={coverUploading}
              onClick={() => setIsCoverDialogOpen(true)}
              aria-label={coverButtonAriaLabel}
              className="gap-1.5 whitespace-nowrap"
            >
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {coverButtonLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canOpenPublish}
              loading={reviewPreparing}
              onClick={() => void handleReadyToPublish()}
              aria-describedby={publishBlockReason ? "publish-readiness" : undefined}
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
              {publishGateCopy.desktopLabel}
            </Button>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMobileMenu((prev) => !prev)}
                aria-label="More editor actions"
                aria-haspopup="menu"
                aria-expanded={showMobileMenu}
                className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-white hover:text-gray-800 ${showMobileMenu ? "bg-white text-gray-800" : "text-gray-500"}`}
              >
                <svg className="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="5" r="1.75" />
                  <circle cx="12" cy="12" r="1.75" />
                  <circle cx="12" cy="19" r="1.75" />
                </svg>
              </button>

              {showMobileMenu ? (
                <>
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    onClick={() => setShowMobileMenu(false)}
                    className="fixed inset-0 z-30"
                  />
                  <div
                    role="menu"
                    aria-label="More editor actions"
                    className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg shadow-black/10"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={coverUploading}
                      onClick={() => {
                        setIsCoverDialogOpen(true);
                        setShowMobileMenu(false);
                      }}
                      aria-label={coverButtonAriaLabel}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {coverButtonLabel}
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            <Button
              type="button"
              size="sm"
              disabled={!canOpenPublish}
              loading={reviewPreparing}
              onClick={() => void handleReadyToPublish()}
              aria-label={publishGateCopy.ariaLabel}
              aria-describedby={publishBlockReason ? "publish-readiness" : undefined}
              className="h-11 px-4"
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
              {publishGateCopy.mobileLabel}
            </Button>
          </div>
        </div>
      </header>

      <div className="sr-only" aria-live="polite">
        {citationNotice}
      </div>

      {publishBlockReason ? (
        <p
          id="publish-readiness"
          className="mb-3 text-right text-xs font-medium text-gray-500"
        >
          Before review: {publishBlockReason}
        </p>
      ) : null}

      {metadataStatus === "error" ? (
        <div
          role="alert"
          className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="text-amber-900">{metadataError}</span>
          <button
            type="button"
            onClick={() => setMetadataReloadKey((value) => value + 1)}
            className="min-h-10 shrink-0 rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900"
          >
            Reload details
          </button>
        </div>
      ) : null}

      {saveError || reviewError ? (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {reviewError || saveError}
        </div>
      ) : null}

      {referenceSaveStatus === "saving" ? (
        <p className="mb-3 text-right text-xs text-gray-500" aria-live="polite">
          Saving sources…
        </p>
      ) : referenceSaveStatus === "error" ? (
        <p className="mb-3 text-right text-xs font-medium text-red-600" aria-live="polite">
          Sources need attention before publishing.
        </p>
      ) : null}

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

      {localBackup ? (
        <div
          className="mb-5 flex animate-slide-up flex-col gap-3 rounded-xl border border-green-wash-border bg-green-wash px-4 py-3.5 text-sm sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold leading-5 text-ink">
              {hasContent ? "Device recovery available" : "Unsaved Article found"}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-gray-600">
              {hasContent
                ? "This device has a different version. Restore it, or keep the server copy currently open."
                : `Restore “${localBackup.title || "Untitled"}” and continue where you stopped.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={dismissBackup}
              className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-gray-500 hover:bg-white/70 hover:text-gray-700"
            >
              {hasContent ? "Keep server copy" : "Dismiss"}
            </button>
            <button
              type="button"
              onClick={restoreFromBackup}
              className="rounded-lg bg-emerald-brand px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-[#0E4B37]"
            >
              Restore device copy
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12 xl:grid-cols-[780px_300px] xl:justify-center">
        <main className="min-w-0">
          {inResponseToId && inResponseToTitle ? (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Writing a response to
                </p>
                <p className="mt-0.5 truncate text-sm font-medium text-gray-900">
                  {inResponseToTitle}
                  {inResponseToAuthor && parentHasOwnTitle ? (
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

          <DraftSignalBar
            postType={postType}
            title={title}
            excerpt={excerpt}
            content={content}
            tags={tags}
            references={references}
            wordCount={wordCount}
            inResponseToTitle={inResponseToTitle}
          />

          <div className="sticky top-[92px] z-20 mb-8 hidden lg:block">
            <div className="flex min-h-[52px] items-center gap-1 rounded-xl border border-gray-200 bg-white/95 px-2.5 py-2 shadow-sm shadow-black/[0.03] backdrop-blur">
              {DESKTOP_TOOLBAR_BUTTONS.map((btn) => (
                <button
                  key={btn.title}
                  type="button"
                  title={btn.title}
                  aria-label={btn.title}
                  aria-pressed={
                    btn.markKey ? Boolean(activeMarks[btn.markKey]) : undefined
                  }
                  onClick={() => runToolbarAction(btn.action)}
                  className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 ${
                    btn.markKey && activeMarks[btn.markKey]
                      ? "bg-emerald-50 text-emerald-700"
                      : ""
                  }`}
                >
                  {btn.icon}
                </button>
              ))}

              <div className="ml-auto flex items-center gap-3 border-l border-gray-100 pl-4 pr-1 text-xs">
                <span className="tabular-nums text-gray-400">
                  {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
                </span>
                <span
                  className={`font-medium ${saveStatus === "error" ? "text-amber-600" : "text-gray-500"}`}
                  aria-live="polite"
                >
                  {compactSaveLabel}
                </span>
              </div>
            </div>

            {showLinkPopover ? (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] hidden items-center gap-2 rounded-xl border border-emerald-100 bg-white p-3 shadow-lg lg:flex">
                <input
                  type="url"
                  autoFocus
                  value={linkPopoverUrl}
                  onChange={(event) => setLinkPopoverUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      editorRef.current?.insertLink(linkPopoverUrl);
                      setShowLinkPopover(false);
                      setLinkPopoverUrl("");
                    }
                    if (event.key === "Escape") setShowLinkPopover(false);
                  }}
                  placeholder="Paste a link"
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-canvas px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand"
                />
                <button
                  type="button"
                  onClick={() => {
                    editorRef.current?.insertLink(linkPopoverUrl);
                    setShowLinkPopover(false);
                    setLinkPopoverUrl("");
                  }}
                  className="rounded-lg bg-emerald-brand px-3.5 py-2 text-sm font-medium text-white"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => setShowLinkPopover(false)}
                  className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>

          <input
            type="text"
            value={title}
            autoFocus
            onChange={(event) => {
              setTitle(event.target.value);
              saveDraft(getCurrentData({ title: event.target.value }));
            }}
            placeholder="Title"
            aria-label="Article title"
            className="w-full rounded-md border-none bg-transparent px-0 py-1.5 font-display text-[32px] font-semibold leading-[1.2] text-ink placeholder:text-gray-500 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-brand/30 lg:text-[48px] lg:leading-[1.08]"
          />

          <div className="mt-2 lg:mt-4">
            <Editor
              ref={editorRef}
              key={`article-editor-${editorSessionKey}`}
              content={content}
              placeholder={getBodyPlaceholder()}
              minWords={selectedPostType.minWords}
              onUpdate={handleEditorUpdate}
              onSelectionUpdate={handleSelectionUpdate}
              canvasMode
              ariaLabel="Article body"
            />
          </div>

          <div className="mt-10 border-t border-gray-100 pt-6 lg:hidden">
            <ReferencesPanel
              references={references}
              onChange={handleReferencesChange}
              onInsertCitation={(referenceId) => {
                editorRef.current?.insertCitation(referenceId);
                setCitationNotice("Source marker inserted at the cursor.");
              }}
            />
          </div>
        </main>

        <aside className="hidden lg:sticky lg:top-[92px] lg:block">
          <ReferencesPanel
            references={references}
            onChange={handleReferencesChange}
            onInsertCitation={(referenceId) => {
              editorRef.current?.insertCitation(referenceId);
              setCitationNotice("Source marker inserted at the cursor.");
            }}
            alwaysExpanded
          />
        </aside>
      </div>

      <div
        className="fixed inset-x-0 z-40 border-t border-gray-200 bg-white shadow-[0_-4px_16px_rgba(15,23,42,0.05)] lg:hidden"
        style={{
          // Ride above the soft keyboard instead of hiding behind it. The
          // variable is published by (write)/layout.tsx and is 0px whenever no
          // keyboard is open, so this collapses to a plain bottom-0 bar.
          bottom: "var(--mobile-visual-viewport-bottom, 0px)",
          // Home-indicator clearance only matters while the bar is actually at
          // the bottom edge; once the keyboard lifts it, that padding would just
          // be a gap, so it shrinks by however far the bar has risen.
          paddingBottom:
            "max(0px, calc(env(safe-area-inset-bottom) - var(--mobile-visual-viewport-bottom, 0px)))",
        }}
      >
        <div className="mx-auto max-w-[1080px] px-5 sm:px-8 lg:px-10">
          <div className="lg:w-[calc(100%-340px)]">
            {showLinkPopover ? (
                <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-3 py-2.5 lg:hidden">
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
                    aria-label="Link URL"
                    className="h-11 min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      editorRef.current?.insertLink(linkPopoverUrl);
                      setShowLinkPopover(false);
                      setLinkPopoverUrl("");
                    }}
                    className="h-11 shrink-0 rounded-lg bg-emerald-brand px-3.5 text-sm font-medium text-white"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLinkPopover(false)}
                    className="h-11 shrink-0 px-2 text-sm text-gray-400"
                  >
                    Cancel
                  </button>
                </div>
            ) : null}
            <div
              className="flex items-center gap-1.5 overflow-x-auto py-2"
              style={{ scrollbarWidth: "none" }}
            >
              {MOBILE_TOOLBAR_BUTTONS.map((btn) => (
                <button
                  key={btn.title}
                  type="button"
                  title={btn.title}
                  aria-label={btn.title}
                  aria-pressed={
                    btn.markKey ? Boolean(activeMarks[btn.markKey]) : undefined
                  }
                  onClick={() => runToolbarAction(btn.action)}
                  className={`flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors ${
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
            ref={exitDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-confirm-title"
            aria-describedby="cancel-confirm-description"
            aria-busy={exitSaving || isLeaving}
            tabIndex={-1}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2 id="cancel-confirm-title" className="text-base font-semibold text-gray-900">
              Leave the editor?
            </h2>
            <p id="cancel-confirm-description" className="mt-2 text-sm leading-6 text-gray-500">
              We&apos;ll save the latest cloud draft before leaving. If this Article
              does not have a title yet, its writing stays in this account&apos;s
              device backup until you restore it.
            </p>
            {coAuthors.length > 0 ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                Co-author selections aren&apos;t saved when you leave. Invitations are
                finalized only when you publish.
              </p>
            ) : null}
            {exitError ? (
              <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                {exitError}
              </p>
            ) : null}
            <div className="mt-5 flex gap-3">
              <Button
                ref={exitKeepWritingRef}
                variant="ghost"
                type="button"
                className="flex-1"
                disabled={exitSaving || isLeaving}
                onClick={() => setShowCancelConfirm(false)}
              >
                Keep writing
              </Button>
              <Button
                type="button"
                className="flex-1"
                loading={exitSaving || isLeaving}
                onClick={() => void handleSaveAndLeave()}
              >
                Save &amp; leave
              </Button>
            </div>
            {exitError ? (
              <button
                type="button"
                onClick={leaveWithDeviceBackup}
                className="mt-3 min-h-10 w-full text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                Leave with device backup
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {currentUserId ? (
        <>
          <CoverImageDialog
            open={isCoverDialogOpen}
            onClose={closeCoverDialog}
            coverImageUrl={coverImageUrl}
            onUpload={(url) => handleMetadataChange({ coverImageUrl: url })}
            onRemove={() => handleMetadataChange({ coverImageUrl: "" })}
            onUploadingChange={setCoverUploading}
            uploading={coverUploading}
            canReviewPublish={canOpenPublish}
            onContinue={closeCoverDialog}
            onReviewPublish={handleReviewPublishFromCover}
            publishLabel={publishGateCopy.desktopLabel}
          />
          <PublishDrawer
            open={isPublishDrawerOpen}
            onClose={() => setIsPublishDrawerOpen(false)}
            draftId={draftId}
            title={title}
            content={content}
            wordCount={wordCount}
            initialTags={tags}
            initialCoverImageUrl={coverImageUrl}
            initialExcerpt={excerpt}
            initialPostType={postType}
            initialArticleFormat={articleFormat}
            initialReferences={references}
            initialCoAuthors={coAuthors}
            currentUserId={currentUserId}
            author={profileInfo}
            inResponseTo={inResponseToId}
            responseContext={
              inResponseToTitle
                ? { title: inResponseToTitle, author: inResponseToAuthor }
                : null
            }
            metadataReady={metadataStatus === "ready"}
            onMetadataChange={handleMetadataChange}
            onPublished={() => {
              clearLocalBackup();
              if (referenceSaveTimerRef.current) {
                clearTimeout(referenceSaveTimerRef.current);
                referenceSaveTimerRef.current = null;
              }
            }}
            coverUploading={coverUploading}
            onCoverUploadingChange={setCoverUploading}
          />
          <ProfileGate
            open={isProfileGateOpen}
            userId={currentUserId}
            initialProfile={profileInfo}
            onClose={() => setIsProfileGateOpen(false)}
            onComplete={(profile) => {
              setProfileInfo(profile);
              setIsProfileGateOpen(false);
              void handleReadyToPublish(profile);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
