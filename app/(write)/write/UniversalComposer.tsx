"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
    <div className="min-h-[360px] animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none" />
  ),
});

type SaveState = "idle" | "saving" | "cloud" | "device" | "error";
type FormatAction = "bold" | "italic" | "heading" | "bulletList" | "orderedList" | "blockquote";

const FORMAT_ACTIONS: ReadonlyArray<{ label: string; mark: FormatAction }> = [
  { label: "Bold", mark: "bold" },
  { label: "Italic", mark: "italic" },
  { label: "Heading", mark: "heading" },
  { label: "Bullets", mark: "bulletList" },
  { label: "Numbers", mark: "orderedList" },
  { label: "Quote", mark: "blockquote" },
];

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
  returnTo,
  parent = null,
  prompt = null,
}: UniversalComposerProps) {
  const router = useRouter();
  const editorRef = useRef<EditorHandle>(null);
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
  const [recovery, setRecovery] = useState<ContributionSnapshot | null>(null);
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

  useEffect(() => {
    const candidates = [localKeyRef.current, `indegenius:post-draft:${userId}`];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(`indegenius:article-draft:v2:${encodeURIComponent(userId)}:`)) {
        candidates.push(key);
      }
    }
    for (const key of candidates) {
      try {
        const parsed = safeSnapshot(JSON.parse(localStorage.getItem(key) ?? "null"), initialSnapshot);
        if (parsed && !snapshotsMatch(parsed, initialSnapshot)) {
          setRecovery(parsed);
          return;
        }
      } catch {
        // A damaged device copy should never block the account copy.
      }
    }
  }, [initialSnapshot, userId]);

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
            if (!targetDraftId && mountedRef.current) {
              setDraftId(result.draftId);
              const url = new URL(window.location.href);
              url.searchParams.set("draft", result.draftId);
              router.replace(`${url.pathname}${url.search}`);
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
    [mode, publishedPostId, router]
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

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "cloud"
        ? "Saved to your account"
        : saveState === "device"
          ? "Saved on this device"
          : saveState === "error"
            ? saveError ?? "Save failed"
            : mode === "published-edit" && editDraftId
              ? "Saved to your account"
              : "";
  const bodyText = contributionText(snapshot.content);

  return (
    <div className={`${mode === "published-edit" ? "fixed inset-0 z-[70]" : "min-h-dvh"} bg-white text-gray-950`}>
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => void requestClose()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand"
            aria-label="Close editor"
          >
            ×
          </button>
          <p aria-live="polite" className={`min-w-0 flex-1 truncate text-xs ${saveState === "error" ? "text-red-600" : "text-gray-500"}`}>
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
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <p className="text-amber-950">There’s a newer device copy of your writing.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setSnapshot(recovery); setShowTitle(Boolean(recovery.title.trim())); setRecovery(null); }} className="min-h-11 rounded-lg bg-amber-900 px-4 font-semibold text-white">Restore</button>
              <button type="button" onClick={() => { localStorage.removeItem(localKeyRef.current); setRecovery(null); }} className="min-h-11 rounded-lg px-3 font-semibold text-amber-900">Discard</button>
            </div>
          </div>
        ) : null}

        {parent ? (
          <p className="mb-5 text-sm text-gray-500">
            Responding to <span className="font-semibold text-gray-800">{parent.displayTitle}</span>
          </p>
        ) : null}
        {prompt ? (
          <section className="mb-7 rounded-xl bg-emerald-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{prompt.title}</p>
            <p className="mt-1 text-sm text-emerald-950">{prompt.responseQuestion || prompt.promptText}</p>
          </section>
        ) : null}

        {showTitle ? (
          <div className="mb-4 flex items-start gap-2">
            <textarea
              autoFocus={!initialSnapshot.title}
              rows={1}
              value={snapshot.title}
              onChange={(event) => setSnapshot((current) => ({ ...current, title: event.target.value }))}
              placeholder="Title"
              aria-label="Title"
              className="min-h-14 flex-1 resize-none overflow-hidden border-0 bg-transparent font-display text-3xl font-semibold leading-tight text-gray-950 outline-none placeholder:text-gray-300 sm:text-4xl"
            />
            <button
              type="button"
              onClick={() => { setSnapshot((current) => ({ ...current, title: "" })); setShowTitle(false); }}
              className="mt-1 min-h-11 rounded-lg px-2 text-xs font-semibold text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowTitle(true)}
            className="mb-5 min-h-11 rounded-lg px-1 text-sm font-semibold text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand"
          >
            + Add title
          </button>
        )}

        <Editor
          key={`${mode}:${publishedPostId ?? initialDraftId ?? "new"}`}
          ref={editorRef}
          content={snapshot.content}
          placeholder="Start writing…"
          ariaLabel="Publication body"
          canvasMode
          showWordCount={false}
          onUpdate={(content) => setSnapshot((current) => current.content === content ? current : { ...current, content })}
          onSelectionUpdate={handleSelectionUpdate}
        />

        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-20 mt-8 flex w-fit max-w-full items-center gap-1 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-lg shadow-gray-900/10">
          <button type="button" onClick={() => setShowFormat((value) => !value)} aria-expanded={showFormat} className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl px-3 text-sm font-semibold ${showFormat ? "bg-gray-100 text-gray-950" : "text-gray-600 hover:bg-gray-50"}`}>Aa</button>
          <button type="button" onClick={() => editorRef.current?.triggerImageUpload()} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-50" aria-label="Insert image">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="m5.5 17 4.25-4.25 3 3 2.25-2.25 3.5 3.5"/><circle cx="15.5" cy="9" r="1.25"/></svg>
          </button>
          <button type="button" onClick={() => setShowLink((value) => !value)} className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl ${activeMarks.link ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-50"}`} aria-label="Add link">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15"/></svg>
          </button>
          <button type="button" onClick={() => setShowMore((value) => !value)} aria-expanded={showMore} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-xl text-gray-600 hover:bg-gray-50" aria-label="More writing options">•••</button>
        </div>

        {showFormat ? (
          <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-2">
            {FORMAT_ACTIONS.map(({ label, mark }) => (
              <button key={mark} type="button" onClick={() => handleFormat(mark)} className={`min-h-11 rounded-lg px-3 text-sm font-medium ${activeMarks[mark] ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-50"}`}>{label}</button>
            ))}
          </div>
        ) : null}
        {showLink ? (
          <div className="mt-3 flex gap-2 rounded-xl border border-gray-200 bg-white p-2">
            <input autoFocus type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { editorRef.current?.insertLink(linkUrl); setShowLink(false); setLinkUrl(""); } if (event.key === "Escape") setShowLink(false); }} placeholder="https://…" className="min-h-11 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-brand" />
            <Button type="button" onClick={() => { editorRef.current?.insertLink(linkUrl); setShowLink(false); setLinkUrl(""); }}>Apply</Button>
          </div>
        ) : null}

        {showMore ? (
          <section className="mt-6 space-y-4 border-t border-gray-100 pt-6">
            <ReferencesPanel references={snapshot.references} onChange={(references) => setSnapshot((current) => ({ ...current, references }))} onInsertCitation={(id) => editorRef.current?.insertCitation(id)} />
            {mode !== "published-edit" ? (
              <CoAuthorPicker userId={userId} value={snapshot.collaborators} onChange={(collaborators) => setSnapshot((current) => ({ ...current, collaborators }))} source="write" />
            ) : null}
            {mode !== "published-edit" ? <MyDrafts activeDraftId={draftId} variant="panel" /> : null}
            {mode === "published-edit" && editDraftId ? (
              <button type="button" onClick={() => setShowDiscard(true)} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-red-600 hover:bg-red-50">Discard edit draft</button>
            ) : null}
          </section>
        ) : null}
      </main>

      {showPublish ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6">
          <button type="button" className="absolute inset-0" onClick={closePublish} aria-label="Close publish preview" />
          <div ref={publishDialogRef} role="dialog" aria-modal="true" aria-labelledby="publish-title" className="relative max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <h2 id="publish-title" className="font-display text-xl font-semibold">Preview</h2>
              <button type="button" onClick={closePublish} disabled={publishing} className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-gray-500 hover:bg-gray-100" aria-label="Close">×</button>
            </div>

            <article className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              {snapshot.coverImageUrl ? (
                <div className="relative aspect-[16/8] w-full bg-gray-100">
                  <Image src={snapshot.coverImageUrl} alt="Cover preview" fill sizes="(max-width: 640px) 100vw, 576px" className="object-cover" />
                </div>
              ) : null}
              <div className="p-5">
                {snapshot.title.trim() ? <h3 className="font-display text-2xl font-semibold leading-tight">{snapshot.title.trim()}</h3> : null}
                <p className={`${snapshot.title.trim() ? "mt-3 text-sm text-gray-600" : "text-base text-gray-800"} line-clamp-5 whitespace-pre-line`}>{bodyText}</p>
                <p className="mt-4 text-xs font-medium text-gray-500">{profile?.full_name || profile?.username}</p>
              </div>
            </article>

            <div className="mt-6 space-y-5">
              <div>
                <label htmlFor="publication-preview-text" className="mb-2 block text-sm font-semibold text-gray-900">Preview text</label>
                <textarea id="publication-preview-text" rows={3} value={snapshot.excerpt} onChange={(event) => setSnapshot((current) => ({ ...current, excerpt: event.target.value }))} placeholder="A short preview is created from your opening." className="w-full resize-none rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-brand" />
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-900">Topics <span className="font-normal text-gray-400">(optional)</span></p>
                <TagInput value={snapshot.tags} onChange={(tags) => setSnapshot((current) => ({ ...current, tags }))} showLabel={false} maxTags={5} placeholder="Add a topic" disabled={publishing} />
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-900">Cover <span className="font-normal text-gray-400">(optional)</span></p>
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4">
          <div ref={leaveDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="leave-title" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="leave-title" className="font-display text-lg font-semibold">Your account copy didn’t save</h2>
            <p className="mt-2 text-sm text-gray-600">This device still has a recovery copy.</p>
            <div className="mt-5 flex gap-3"><Button type="button" variant="secondary" onClick={closeLeave} className="flex-1 min-h-11">Keep writing</Button><Button type="button" variant="danger" onClick={navigateAway} className="flex-1 min-h-11">Leave with device copy</Button></div>
          </div>
        </div>
      ) : null}

      {showDiscard && editDraftId ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4">
          <div ref={discardDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="discard-title" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="discard-title" className="font-display text-lg font-semibold">Discard this edit draft?</h2>
            <p className="mt-2 text-sm text-gray-600">Your live publication will stay unchanged.</p>
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
