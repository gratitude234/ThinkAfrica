"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Button from "@/components/ui/Button";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import ProfileGate from "@/components/ui/ProfileGate";
import TagInput from "@/components/ui/TagInput";
import ReferencesPanel from "@/components/post/ReferencesPanel";
import CoAuthorPicker from "@/components/collaboration/CoAuthorPicker";
import type { EditorHandle } from "@/components/editor/Editor";
import {
  contributionText,
  deriveContributionExcerpt,
  hasMeaningfulContribution,
  type ComposerMode,
  type ContributionSnapshot,
} from "@/lib/contribution";
import { ensureContributionDraft, publishContribution } from "./actions";
import {
  applyPublishedEditDraft,
  discardPublishedEditDraft,
  savePublishedEditDraft,
} from "./editActions";
import MyDrafts from "./MyDrafts";

const Editor = dynamic(() => import("@/components/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[360px] animate-pulse rounded-xl bg-canvas motion-reduce:animate-none" />
  ),
});

type SaveState = "idle" | "saving" | "cloud" | "device" | "error";
type FormatAction = "bold" | "italic" | "heading" | "bulletList" | "orderedList" | "blockquote";

function Icon({ path, className = "h-5 w-5" }: { path: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

/**
 * The bottom bar is drawn in icons, so this row is too. It stays available on
 * every device rather than deferring to the selection bubble on desktop: the
 * bubble needs a selection, while this row also works from a collapsed caret,
 * which is how someone turns on bold and then types.
 */
const FORMAT_ACTIONS: ReadonlyArray<{ label: string; mark: FormatAction; path: ReactNode }> = [
  { label: "Bold", mark: "bold", path: <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zm0 7h7a3.5 3.5 0 0 1 0 7H7z" /> },
  { label: "Italic", mark: "italic", path: <path d="M15 5h-5m4 14H9M14 5l-4 14" /> },
  { label: "Heading", mark: "heading", path: <path d="M6 5v14M18 5v14M6 12h12" /> },
  {
    label: "Bullets",
    mark: "bulletList",
    path: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" /></>,
  },
  {
    label: "Numbers",
    mark: "orderedList",
    path: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 5.5h1V9M3.6 15.2a1.2 1.2 0 1 1 1.9 1.4L3.6 18.6H5.6" /></>,
  },
  { label: "Quote", mark: "blockquote", path: <path d="M5 5v14M10 8h9M10 12h9M10 16h6" /> },
];

const CLOSE_ICON = <path d="M6 6l12 12M18 6 6 18" />;
const PLUS_ICON = <path d="M12 5v14M5 12h14" />;
const MORE_ICON = (
  <>
    <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </>
);
const IMAGE_ICON = (
  <>
    <rect x="3.5" y="4" width="17" height="16" rx="2" />
    <path d="m5.5 17 4.25-4.25 3 3 2.25-2.25 3.5 3.5" />
    <circle cx="15.5" cy="9" r="1.25" />
  </>
);
const LINK_ICON = (
  <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15" />
);

interface WriterProfile {
  full_name: string | null;
  username: string | null;
  university: string | null;
}

interface UniversalComposerProps {
  mode: ComposerMode;
  userId: string;
  profile: WriterProfile | null;
  initialSnapshot: ContributionSnapshot;
  draftId?: string | null;
  editDraftId?: string | null;
  publishedPostId?: string | null;
  publishedSlug?: string | null;
  /** When the account copy was last written, so a stale device copy can be told apart from a newer one. */
  draftUpdatedAt?: string | null;
  returnTo: string;
  parent?: { id: string; displayTitle: string; slug: string } | null;
  prompt?: { id: string; title: string; promptText: string; responseQuestion: string | null } | null;
}

const LOCAL_PREFIX = "indegenius:contribution-draft:v1";
const LOCAL_DELAY = 350;
const CLOUD_DELAY = 2000;
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function snapshotsMatch(left: ContributionSnapshot, right: ContributionSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safeSnapshot(value: unknown, fallback: ContributionSnapshot) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const data =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : record;
  const body = typeof data.body === "string" ? data.body : null;
  const content = typeof data.content === "string" ? data.content : body ? textToHtml(body) : fallback.content;
  const snapshot: ContributionSnapshot = {
    ...fallback,
    title: typeof data.title === "string" ? data.title : fallback.title,
    content,
    excerpt: typeof data.excerpt === "string" ? data.excerpt : fallback.excerpt,
    tags: Array.isArray(data.tags)
      ? data.tags.filter((tag): tag is string => typeof tag === "string")
      : Array.isArray(data.topics)
        ? data.topics.filter((tag): tag is string => typeof tag === "string")
        : fallback.tags,
    coverImageUrl:
      typeof data.coverImageUrl === "string"
        ? data.coverImageUrl
        : typeof data.imageUrl === "string"
          ? data.imageUrl
          : fallback.coverImageUrl,
    references: Array.isArray(data.references)
      ? (data.references as ContributionSnapshot["references"])
      : fallback.references,
    collaborators: Array.isArray(data.collaborators)
      ? (data.collaborators as ContributionSnapshot["collaborators"])
      : fallback.collaborators,
    inResponseToId:
      typeof data.inResponseToId === "string" ? data.inResponseToId : fallback.inResponseToId,
    promptId: typeof data.promptId === "string" ? data.promptId : fallback.promptId,
  };
  return hasMeaningfulContribution(snapshot) ? snapshot : null;
}

function textToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) =>
      `<p>${paragraph
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>")}</p>`
    )
    .join("");
}

function useModalFocus(
  open: boolean,
  dialogRef: RefObject<HTMLDivElement | null>,
  onClose: () => void,
  busy = false
) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [busy, dialogRef, onClose, open]);
}

export default function UniversalComposer({
  mode,
  userId,
  profile: initialProfile,
  initialSnapshot,
  draftId: initialDraftId = null,
  editDraftId: initialEditDraftId = null,
  publishedPostId = null,
  publishedSlug = null,
  draftUpdatedAt = null,
  returnTo,
  parent = null,
  prompt = null,
}: UniversalComposerProps) {
  const router = useRouter();
  const editorRef = useRef<EditorHandle>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const publishDialogRef = useRef<HTMLDivElement>(null);
  const leaveDialogRef = useRef<HTMLDivElement>(null);
  const discardDialogRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [profile, setProfile] = useState(initialProfile);
  const [draftId, setDraftId] = useState(initialDraftId);
  const [editDraftId, setEditDraftId] = useState(initialEditDraftId);
  const draftIdRef = useRef(initialDraftId);
  const editDraftIdRef = useRef(initialEditDraftId);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<{ snapshot: ContributionSnapshot; key: string } | null>(null);
  const [showTitle, setShowTitle] = useState(Boolean(initialSnapshot.title.trim()));
  const [showMore, setShowMore] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [activeMarks, setActiveMarks] = useState<Record<string, boolean>>({});
  const [showPublish, setShowPublish] = useState(false);
  const [showProfileGate, setShowProfileGate] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const localTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisionRef = useRef(0);
  const latestRef = useRef(snapshot);
  const lastPersistedRef = useRef(initialSnapshot);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const mountedRef = useRef(true);
  const localKeyRef = useRef(
    `${LOCAL_PREFIX}:${userId}:${mode}:${publishedPostId ?? initialDraftId ?? snapshot.inResponseToId ?? "new"}`
  );
  // The document this canvas is currently editing. It picks up an id when the
  // first autosave mints a draft, so a later arrival of that same id reads as
  // "still the same piece" rather than as a switch to a different one.
  const documentIdRef = useRef(publishedPostId ?? initialDraftId ?? null);
  const [documentKey, setDocumentKey] = useState(publishedPostId ?? initialDraftId ?? "new");
  const scannedRef = useRef(false);

  const closePublish = useCallback(() => setShowPublish(false), []);
  const closeLeave = useCallback(() => setShowLeave(false), []);
  const closeDiscard = useCallback(() => setShowDiscard(false), []);
  useModalFocus(showPublish, publishDialogRef, closePublish, publishing);
  useModalFocus(showLeave, leaveDialogRef, closeLeave);
  useModalFocus(showDiscard, discardDialogRef, closeDiscard);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
      if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    };
  }, []);

  // Resuming another draft from the drafts panel is a client-side navigation
  // into this same component instance, so none of the state below re-derives on
  // its own. Without this the canvas would keep the previous draft's text and
  // keep autosaving it to the previous draft, under the new draft's address.
  useEffect(() => {
    const incoming = publishedPostId ?? initialDraftId ?? null;
    if (!incoming || incoming === documentIdRef.current) return;
    documentIdRef.current = incoming;
    draftIdRef.current = initialDraftId;
    editDraftIdRef.current = initialEditDraftId;
    revisionRef.current += 1;
    latestRef.current = initialSnapshot;
    lastPersistedRef.current = initialSnapshot;
    localKeyRef.current = `${LOCAL_PREFIX}:${userId}:${mode}:${incoming}`;
    scannedRef.current = false;
    setSnapshot(initialSnapshot);
    setDraftId(initialDraftId);
    setEditDraftId(initialEditDraftId);
    setShowTitle(Boolean(initialSnapshot.title.trim()));
    setRecovery(null);
    setSaveState("idle");
    setSaveError(null);
    setShowPublish(false);
    setDocumentKey(incoming);
  }, [initialDraftId, initialEditDraftId, initialSnapshot, mode, publishedPostId, userId]);

  useEffect(() => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    const candidates = [localKeyRef.current, `indegenius:post-draft:${userId}`];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(`indegenius:article-draft:v2:${encodeURIComponent(userId)}:`)) {
        candidates.push(key);
      }
    }
    const accountSavedAt = draftUpdatedAt ? Date.parse(draftUpdatedAt) : Number.NaN;
    for (const key of candidates) {
      if (localStorage.getItem(key) === null) continue;
      try {
        const raw = JSON.parse(localStorage.getItem(key) ?? "null") as { savedAt?: unknown } | null;
        const parsed = safeSnapshot(raw, initialSnapshot);
        if (!parsed || snapshotsMatch(parsed, initialSnapshot)) {
          // Nothing this copy could add back, so it stops asking. Keys written
          // by the composers this one replaced are otherwise permanent: they
          // are never rewritten, so they would offer the same stale writing on
          // every visit forever.
          localStorage.removeItem(key);
          continue;
        }
        const deviceSavedAt = typeof raw?.savedAt === "string" ? Date.parse(raw.savedAt) : Number.NaN;
        if (
          Number.isFinite(accountSavedAt) &&
          Number.isFinite(deviceSavedAt) &&
          deviceSavedAt <= accountSavedAt
        ) {
          // The account copy is provably the newer one, so restoring this would
          // be a downgrade, not a recovery.
          localStorage.removeItem(key);
          continue;
        }
        setRecovery({ snapshot: parsed, key });
        return;
      } catch {
        // A damaged device copy should never block the account copy.
        localStorage.removeItem(key);
      }
    }
  }, [draftUpdatedAt, initialSnapshot, userId]);

  const persist = useCallback(
    (next: ContributionSnapshot, revision: number) => {
      setSaveState("saving");
      setSaveError(null);
      const operation = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (mode === "published-edit") {
            if (!publishedPostId) throw new Error("This publication cannot be edited.");
            const result = await savePublishedEditDraft({ postId: publishedPostId, snapshot: next });
            if (result.error || !result.editDraftId) throw new Error(result.error ?? "We couldn't save this edit.");
            editDraftIdRef.current = result.editDraftId;
            if (mountedRef.current) setEditDraftId(result.editDraftId);
          } else {
            const targetDraftId = draftIdRef.current;
            const result = await ensureContributionDraft({ draftId: targetDraftId, snapshot: next });
            if (result.error || !result.draftId) throw new Error(result.error ?? "We couldn't save this draft.");
            draftIdRef.current = result.draftId;
            documentIdRef.current = result.draftId;
            if (!targetDraftId && mountedRef.current) {
              setDraftId(result.draftId);
              const url = new URL(window.location.href);
              url.searchParams.set("draft", result.draftId);
              // Deliberately a shallow URL update rather than router.replace.
              // Re-rendering the server page here would flip `mode` from "new"
              // to "draft" and hand the canvas a draft id, remounting the
              // editor under the writer's cursor about two seconds into every
              // new piece. The address still survives a refresh or a back.
              window.history.replaceState(null, "", `${url.pathname}${url.search}`);
            }
          }
          if (!mountedRef.current) return;
          lastPersistedRef.current = next;
          if (revision === revisionRef.current) {
            localStorage.removeItem(localKeyRef.current);
            setSaveState("cloud");
          }
        })
        .catch((error: unknown) => {
          if (!mountedRef.current) return;
          setSaveState("error");
          setSaveError(error instanceof Error ? error.message : "We couldn't save your changes.");
        });
      saveQueueRef.current = operation;
      return operation;
    },
    [mode, publishedPostId]
  );

  useEffect(() => {
    latestRef.current = snapshot;
    if (snapshotsMatch(snapshot, lastPersistedRef.current)) return;
    const revision = ++revisionRef.current;
    if (localTimerRef.current) clearTimeout(localTimerRef.current);
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);

    localTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(
          localKeyRef.current,
          JSON.stringify({ version: 1, savedAt: new Date().toISOString(), data: snapshot })
        );
        if (mountedRef.current) setSaveState("device");
      } catch {
        // Cloud persistence below remains available when storage is blocked.
      }
    }, LOCAL_DELAY);

    if (hasMeaningfulContribution(snapshot)) {
      cloudTimerRef.current = setTimeout(() => void persist(snapshot, revision), CLOUD_DELAY);
    }
    return () => {
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
      if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    };
  }, [persist, snapshot]);

  const flush = useCallback(async () => {
    if (localTimerRef.current) clearTimeout(localTimerRef.current);
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    const current = latestRef.current;
    if (!hasMeaningfulContribution(current) || snapshotsMatch(current, lastPersistedRef.current)) {
      return true;
    }
    const revision = ++revisionRef.current;
    await persist(current, revision);
    await saveQueueRef.current;
    return snapshotsMatch(current, lastPersistedRef.current);
  }, [persist]);

  const navigateAway = useCallback(() => router.push(returnTo), [returnTo, router]);
  const requestClose = async () => {
    if (!hasMeaningfulContribution(snapshot)) {
      navigateAway();
      return;
    }
    const saved = await flush();
    if (saved) navigateAway();
    else setShowLeave(true);
  };

  const openPublishSheet = () => {
    if (!profile?.full_name?.trim() || !profile.username?.trim()) {
      setShowProfileGate(true);
      return;
    }
    setSnapshot((current) => ({
      ...current,
      excerpt: current.excerpt.trim() || deriveContributionExcerpt(current.content),
    }));
    setShowPublish(true);
  };

  const finishPublication = async () => {
    if (!contributionText(snapshot.content)) return;
    setPublishing(true);
    setSaveError(null);
    try {
      if (mode === "published-edit") {
        let targetEditDraftId = editDraftIdRef.current;
        if (!targetEditDraftId) {
          if (!publishedPostId) throw new Error("This publication cannot be edited.");
          const created = await savePublishedEditDraft({ postId: publishedPostId, snapshot });
          if (created.error || !created.editDraftId) throw new Error(created.error ?? "We couldn't save this edit.");
          targetEditDraftId = created.editDraftId;
          editDraftIdRef.current = created.editDraftId;
          setEditDraftId(created.editDraftId);
        } else {
          const saved = await flush();
          if (!saved) throw new Error(saveError ?? "We couldn't save this edit.");
          targetEditDraftId = editDraftIdRef.current;
        }
        if (!targetEditDraftId) throw new Error("We couldn't resolve this edit draft.");
        const result = await applyPublishedEditDraft({ editDraftId: targetEditDraftId });
        if (result.error) throw new Error(result.error);
        localStorage.removeItem(localKeyRef.current);
        router.replace(`/post/${result.slug ?? publishedSlug}`);
      } else {
        const result = await publishContribution({ draftId: draftIdRef.current, snapshot });
        if (result.error || !result.slug) throw new Error(result.error ?? "We couldn't publish this.");
        localStorage.removeItem(localKeyRef.current);
        router.replace(`/post/${result.slug}?justPublished=1&live=1`);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "We couldn't finish this publication.");
      setPublishing(false);
    }
  };

  const handleSelectionUpdate = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setActiveMarks({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      heading: editor.isActive("heading", { level: 2 }),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      blockquote: editor.isActive("blockquote"),
      link: editor.isActive("link"),
    });
  }, []);

  const handleFormat = useCallback((format: FormatAction) => {
    const editor = editorRef.current;
    if (!editor) return;

    if (format === "bold") editor.toggleBold();
    else if (format === "italic") editor.toggleItalic();
    else if (format === "heading") editor.toggleH2();
    else if (format === "bulletList") editor.toggleBulletList();
    else if (format === "orderedList") editor.toggleOrderedList();
    else editor.toggleBlockquote();
  }, []);

  // A one-line textarea with overflow hidden clips its second line, and a
  // title long enough to wrap is exactly the kind someone wants to read back.
  useEffect(() => {
    const field = titleRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [showTitle, snapshot.title]);

  // "Saved" is the resting state. Only the device-only case earns more words,
  // because it is the only one that carries a consequence for the writer.
  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "cloud"
        ? "Saved"
        : saveState === "device"
          ? "Saved on this device"
          : saveState === "error"
            ? saveError ?? "Save failed"
            : mode === "published-edit" && editDraftId
              ? "Saved"
              : "";
  const bodyText = contributionText(snapshot.content);
  const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;
  const canResumeOtherDrafts = mode !== "published-edit" && !hasMeaningfulContribution(snapshot);

  return (
    <div className={`${mode === "published-edit" ? "fixed inset-0 z-[70]" : "min-h-dvh"} bg-surface text-ink`}>
      <header className="sticky top-0 z-30 border-b border-divider bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => void requestClose()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand"
            aria-label="Close editor"
          >
            <Icon path={CLOSE_ICON} />
          </button>
          <p aria-live="polite" className={`min-w-0 flex-1 truncate text-xs ${saveState === "error" ? "text-red-600" : "text-ink-muted"}`}>
            {saveLabel}
          </p>
          <Button
            type="button"
            onClick={openPublishSheet}
            disabled={!bodyText || coverUploading}
            className="min-h-11 rounded-full px-5"
          >
            {mode === "published-edit" ? "Update" : "Publish"}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-32 pt-7 sm:px-8 sm:pt-11">
        {recovery ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold-tint px-4 py-3 text-sm">
            <p className="text-gold-ink">This device has an unsaved copy of your writing.</p>
            <div className="flex gap-2">
              {/* Both actions clear the key the copy actually came from, which
                  is not always this canvas's own key. */}
              <button type="button" onClick={() => { localStorage.removeItem(recovery.key); setSnapshot(recovery.snapshot); setShowTitle(Boolean(recovery.snapshot.title.trim())); setRecovery(null); }} className="min-h-11 rounded-lg bg-gold-ink px-4 font-semibold text-white">Restore</button>
              <button type="button" onClick={() => { localStorage.removeItem(recovery.key); setRecovery(null); }} className="min-h-11 rounded-lg px-3 font-semibold text-gold-ink">Discard</button>
            </div>
          </div>
        ) : null}

        {/* Responding to a post and answering a campus prompt are the same
            idea: context for what this piece is written into. One treatment. */}
        {parent || prompt ? (
          <section className="mb-7 rounded-xl border-l-2 border-emerald-brand/25 bg-green-wash px-4 py-3">
            <p className="text-kicker font-semibold uppercase text-emerald-ink">
              {prompt ? prompt.title : "Responding to"}
            </p>
            <p className="mt-1 text-sm text-ink">
              {prompt ? prompt.responseQuestion || prompt.promptText : parent?.displayTitle}
            </p>
          </section>
        ) : null}

        {showTitle ? (
          <div className="mb-4 flex items-start gap-2">
            <textarea
              ref={titleRef}
              autoFocus={!initialSnapshot.title}
              rows={1}
              value={snapshot.title}
              onChange={(event) => setSnapshot((current) => ({ ...current, title: event.target.value }))}
              placeholder="Title"
              aria-label="Title"
              className="min-h-14 flex-1 resize-none overflow-hidden border-0 bg-transparent font-display text-3xl font-semibold leading-tight text-ink outline-none placeholder:text-ink-muted/40 sm:text-4xl"
            />
            <button
              type="button"
              onClick={() => { setSnapshot((current) => ({ ...current, title: "" })); setShowTitle(false); }}
              className="mt-1 min-h-11 rounded-lg px-2 text-xs font-semibold text-ink-muted hover:bg-canvas hover:text-ink"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowTitle(true)}
            className="mb-5 -ml-1 flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand"
          >
            <Icon path={PLUS_ICON} className="h-4 w-4" />
            Add title
          </button>
        )}

        <Editor
          key={documentKey}
          ref={editorRef}
          content={snapshot.content}
          placeholder="Start writing…"
          ariaLabel="Publication body"
          canvasMode
          showWordCount={false}
          // Body-first means the caret starts in the body. Adding a title is
          // the deliberate detour, and it takes focus when it opens.
          autoFocus={mode !== "published-edit" && !initialSnapshot.title}
          onUpdate={(content) => setSnapshot((current) => current.content === content ? current : { ...current, content })}
          onSelectionUpdate={handleSelectionUpdate}
        />

        {/* Resuming another piece is offered only while this canvas is still
            empty. Once there is writing here, switching drafts mid-sentence is
            a hazard rather than a convenience. */}
        {canResumeOtherDrafts ? (
          <div className="mt-10">
            <MyDrafts activeDraftId={draftId} variant="panel" />
          </div>
        ) : null}

        <div
          className="sticky z-20 mt-8 flex w-fit max-w-full items-center gap-1 rounded-2xl border border-card-border bg-surface p-1.5 shadow-lg shadow-ink/10"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.75rem + var(--mobile-visual-viewport-bottom, 0px))" }}
        >
          <button type="button" onClick={() => setShowFormat((value) => !value)} aria-expanded={showFormat} className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl px-3 text-sm font-semibold transition-colors ${showFormat ? "bg-canvas text-ink" : "text-ink-muted hover:bg-canvas hover:text-ink"}`} aria-label="Formatting">Aa</button>
          <button type="button" onClick={() => editorRef.current?.triggerImageUpload()} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-canvas hover:text-ink" aria-label="Insert image">
            <Icon path={IMAGE_ICON} />
          </button>
          <button type="button" onClick={() => setShowLink((value) => !value)} className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl transition-colors ${activeMarks.link ? "bg-green-tint text-emerald-ink" : "text-ink-muted hover:bg-canvas hover:text-ink"}`} aria-label="Add link">
            <Icon path={LINK_ICON} />
          </button>
          <button type="button" onClick={() => setShowMore((value) => !value)} aria-expanded={showMore} className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl transition-colors ${showMore ? "bg-canvas text-ink" : "text-ink-muted hover:bg-canvas hover:text-ink"}`} aria-label="More writing options">
            <Icon path={MORE_ICON} />
          </button>
        </div>

        {showFormat ? (
          <div className="mt-3 flex flex-wrap gap-1 rounded-xl border border-card-border bg-surface p-2">
            {FORMAT_ACTIONS.map(({ label, mark, path }) => (
              <button
                key={mark}
                type="button"
                onClick={() => handleFormat(mark)}
                aria-label={label}
                aria-pressed={Boolean(activeMarks[mark])}
                title={label}
                className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors ${activeMarks[mark] ? "bg-green-tint text-emerald-ink" : "text-ink-muted hover:bg-canvas hover:text-ink"}`}
              >
                <Icon path={path} />
              </button>
            ))}
          </div>
        ) : null}
        {showLink ? (
          <div className="mt-3 flex gap-2 rounded-xl border border-card-border bg-surface p-2">
            <input autoFocus type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { editorRef.current?.insertLink(linkUrl); setShowLink(false); setLinkUrl(""); } if (event.key === "Escape") setShowLink(false); }} placeholder="https://…" className="min-h-11 min-w-0 flex-1 rounded-lg border border-card-border bg-surface px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-emerald-brand" />
            <Button type="button" onClick={() => { editorRef.current?.insertLink(linkUrl); setShowLink(false); setLinkUrl(""); }}>Apply</Button>
          </div>
        ) : null}

        {showMore ? (
          <section className="mt-6 space-y-7 border-t border-divider pt-6">
            {/* Sources and co-authors are different jobs, citation and
                attribution, so each says which it is rather than stacking
                into one undifferentiated pile. */}
            <div>
              <h2 className="mb-3 text-kicker font-semibold uppercase text-ink-muted">Sources</h2>
              <ReferencesPanel references={snapshot.references} onChange={(references) => setSnapshot((current) => ({ ...current, references }))} onInsertCitation={(id) => editorRef.current?.insertCitation(id)} />
            </div>
            {mode !== "published-edit" ? (
              <div>
                <h2 className="mb-3 text-kicker font-semibold uppercase text-ink-muted">Co-authors</h2>
                <CoAuthorPicker userId={userId} value={snapshot.collaborators} onChange={(collaborators) => setSnapshot((current) => ({ ...current, collaborators }))} source="write" />
              </div>
            ) : null}
            {mode === "published-edit" && editDraftId ? (
              <button type="button" onClick={() => setShowDiscard(true)} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-red-600 hover:bg-red-50">Discard edit draft</button>
            ) : null}
          </section>
        ) : null}
      </main>

      {showPublish ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6">
          <button type="button" className="absolute inset-0" onClick={closePublish} aria-label="Close publish preview" />
          <div
            ref={publishDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-title"
            // Cmd/Ctrl+Enter is the muscle memory for "send this", and the
            // sheet is the only place where that is unambiguous.
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && bodyText && !coverUploading && !publishing) {
                event.preventDefault();
                void finishPublication();
              }
            }}
            className="relative max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-surface p-5 text-ink shadow-2xl sm:rounded-3xl sm:p-7"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 id="publish-title" className="font-display text-xl font-semibold">Preview</h2>
              <button type="button" onClick={closePublish} disabled={publishing} className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink" aria-label="Close">
                <Icon path={CLOSE_ICON} />
              </button>
            </div>

            <article className="mt-5 overflow-hidden rounded-2xl border border-card-border bg-card">
              {snapshot.coverImageUrl ? (
                <div className="relative aspect-[16/8] w-full bg-canvas">
                  <Image src={snapshot.coverImageUrl} alt="Cover preview" fill sizes="(max-width: 640px) 100vw, 576px" className="object-cover" />
                </div>
              ) : null}
              <div className="p-5">
                {snapshot.title.trim() ? <h3 className="font-display text-2xl font-semibold leading-tight">{snapshot.title.trim()}</h3> : null}
                <p className={`${snapshot.title.trim() ? "mt-3 text-sm text-ink-muted" : "text-base text-ink"} line-clamp-5 whitespace-pre-line`}>{bodyText}</p>
                <p className="mt-4 text-xs font-medium text-ink-muted">{profile?.full_name || profile?.username}</p>
              </div>
            </article>

            {/* The canvas stays free of a running count. Here, at the moment of
                committing, the length is information rather than pressure. */}
            <p className="mt-3 text-meta text-ink-muted">
              {wordCount === 1 ? "1 word" : `${wordCount.toLocaleString()} words`}
              {snapshot.title.trim() ? " · full article presentation" : " · compact presentation"}
            </p>

            <div className="mt-6 space-y-5">
              <div>
                <label htmlFor="publication-summary" className="mb-2 block text-sm font-semibold text-ink">Summary</label>
                <textarea id="publication-summary" rows={3} value={snapshot.excerpt} onChange={(event) => setSnapshot((current) => ({ ...current, excerpt: event.target.value }))} placeholder="A short summary is created from your opening." className="w-full resize-none rounded-xl border border-card-border bg-surface px-3 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-emerald-brand" />
                <p className="mt-1.5 text-meta text-ink-muted">This is what readers see in the feed.</p>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">Topics <span className="font-normal text-ink-muted">(optional)</span></p>
                <TagInput value={snapshot.tags} onChange={(tags) => setSnapshot((current) => ({ ...current, tags }))} showLabel={false} maxTags={5} placeholder="Add a topic" disabled={publishing} />
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">Cover <span className="font-normal text-ink-muted">(optional)</span></p>
                <CoverImageUploader initialUrl={snapshot.coverImageUrl} onUpload={(coverImageUrl) => setSnapshot((current) => ({ ...current, coverImageUrl }))} onRemove={() => setSnapshot((current) => ({ ...current, coverImageUrl: "" }))} onUploadingChange={setCoverUploading} variant="compact" emptyTitle="Add cover" />
              </div>
            </div>

            {saveError ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p> : null}
            <Button type="button" size="lg" loading={publishing} disabled={!bodyText || coverUploading} onClick={() => void finishPublication()} className="mt-7 min-h-12 w-full rounded-full">
              {mode === "published-edit" ? "Update now" : "Publish now"}
            </Button>
          </div>
        </div>
      ) : null}

      {showLeave ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 px-4">
          <div ref={leaveDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="leave-title" className="w-full max-w-sm rounded-2xl bg-surface p-6 text-ink shadow-2xl">
            <h2 id="leave-title" className="font-display text-lg font-semibold">Your account copy didn’t save</h2>
            <p className="mt-2 text-sm text-ink-muted">This device still has a recovery copy.</p>
            <div className="mt-5 flex gap-3"><Button type="button" variant="secondary" onClick={closeLeave} className="flex-1 min-h-11">Keep writing</Button><Button type="button" variant="danger" onClick={navigateAway} className="flex-1 min-h-11">Leave with device copy</Button></div>
          </div>
        </div>
      ) : null}

      {showDiscard && editDraftId ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 px-4">
          <div ref={discardDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="discard-title" className="w-full max-w-sm rounded-2xl bg-surface p-6 text-ink shadow-2xl">
            <h2 id="discard-title" className="font-display text-lg font-semibold">Discard this edit draft?</h2>
            <p className="mt-2 text-sm text-ink-muted">Your live publication will stay unchanged.</p>
            <div className="mt-5 flex gap-3"><Button type="button" variant="secondary" onClick={closeDiscard} className="flex-1 min-h-11">Cancel</Button><Button type="button" variant="danger" onClick={async () => { const result = await discardPublishedEditDraft({ editDraftId }); if (!result.error) { localStorage.removeItem(localKeyRef.current); router.push(`/post/${publishedSlug}`); } else setSaveError(result.error); }} className="flex-1 min-h-11">Discard</Button></div>
          </div>
        </div>
      ) : null}

      {showProfileGate ? (
        <ProfileGate open userId={userId} initialProfile={profile} onClose={() => setShowProfileGate(false)} onComplete={(next) => { setProfile(next); setShowProfileGate(false); setShowPublish(true); }} />
      ) : null}
    </div>
  );
}
