"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  contributionText,
  deservesCloudDraft,
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
import { deleteOwnDraftPosts } from "./deleteActions";

/**
 * Everything the composer does that is not drawing a screen: the working copy,
 * the device and account saves, recovering a copy left on this device,
 * publishing, and leaving. It was the top half of UniversalComposer.tsx and
 * moved here unchanged, so the Post composer and the Article editor share one
 * implementation of the part that must never lose writing.
 */

export type SaveState = "idle" | "saving" | "cloud" | "device" | "error";

const LOCAL_PREFIX = "indegenius:contribution-draft:v1";
const LOCAL_DELAY = 350;
const CLOUD_DELAY = 2000;

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

export interface ContributionDraftOptions {
  mode: ComposerMode;
  userId: string;
  initialSnapshot: ContributionSnapshot;
  draftId?: string | null;
  editDraftId?: string | null;
  publishedPostId?: string | null;
  publishedSlug?: string | null;
  /** When the account copy was last written, so a stale device copy can be told apart from a newer one. */
  draftUpdatedAt?: string | null;
  returnTo: string;
  /**
   * Called after the hook has reset itself for a genuinely different document,
   * so the screen can reset what it holds too.
   */
  onDocumentChange?: (snapshot: ContributionSnapshot) => void;
}

export function useContributionDraft({
  mode,
  userId,
  initialSnapshot,
  draftId: initialDraftId = null,
  editDraftId: initialEditDraftId = null,
  publishedPostId = null,
  publishedSlug = null,
  draftUpdatedAt = null,
  returnTo,
  onDocumentChange,
}: ContributionDraftOptions) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [draftId, setDraftId] = useState(initialDraftId);
  const [editDraftId, setEditDraftId] = useState(initialEditDraftId);
  const draftIdRef = useRef(initialDraftId);
  const editDraftIdRef = useRef(initialEditDraftId);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<{ snapshot: ContributionSnapshot; key: string } | null>(null);
  // Where the writer was going when the account save failed, so "Leave with
  // device copy" goes there rather than always to returnTo.
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  // Set while a discard runs. An autosave now would recreate what it deletes.
  const discardedRef = useRef(false);
  const [publishing, setPublishing] = useState(false);
  const localTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revisionRef = useRef(0);
  const latestRef = useRef(snapshot);
  const lastPersistedRef = useRef(initialSnapshot);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const mountedRef = useRef(true);
  const localKeyRef = useRef(
    `${LOCAL_PREFIX}:${userId}:${mode}:${publishedPostId ?? initialDraftId ?? "new"}`
  );
  // The document this canvas is currently editing. It picks up an id when the
  // first autosave mints a draft, so a later arrival of that same id reads as
  // "still the same piece" rather than as a switch to a different one.
  const documentIdRef = useRef(publishedPostId ?? initialDraftId ?? null);
  const [documentKey, setDocumentKey] = useState(publishedPostId ?? initialDraftId ?? "new");
  const scannedRef = useRef(false);
  const onDocumentChangeRef = useRef(onDocumentChange);

  // Declared before the reset below, so the reset always calls the newest callback.
  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
      if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    };
  }, []);

  // Resuming another draft is a client-side navigation into this same
  // component instance, so none of the state below re-derives on its own.
  // Without this the canvas would keep the previous draft's text and keep
  // autosaving it to the previous draft, under the new draft's address.
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
    setRecovery(null);
    setSaveState("idle");
    setSaveError(null);
    setDocumentKey(incoming);
    onDocumentChangeRef.current?.(initialSnapshot);
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
        // A copy too small to have earned a draft is too small to interrupt
        // for, so a stray keystroke cannot leave a banner waiting on every
        // future visit.
        if (!parsed || snapshotsMatch(parsed, initialSnapshot) || !deservesCloudDraft(parsed)) {
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
          if (discardedRef.current) return;
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
    if (discardedRef.current) return;
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

    if (deservesCloudDraft(snapshot)) {
      cloudTimerRef.current = setTimeout(() => void persist(snapshot, revision), CLOUD_DELAY);
    }
    return () => {
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
      if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    };
  }, [persist, snapshot]);

  const flush = useCallback(
    async (options: { force?: boolean } = {}) => {
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
      if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
      const current = latestRef.current;
      // Below the cloud bar there is nothing to flush, and reporting that as a
      // failed save would raise the "didn't save" dialog over three characters.
      // The device copy still holds them. Save draft is the deliberate act that
      // bar waits for, so a forced save only needs something written.
      const worthSaving = options.force
        ? hasMeaningfulContribution(current)
        : deservesCloudDraft(current);
      if (!worthSaving || snapshotsMatch(current, lastPersistedRef.current)) {
        return true;
      }
      const revision = ++revisionRef.current;
      await persist(current, revision);
      await saveQueueRef.current;
      return snapshotsMatch(current, lastPersistedRef.current);
    },
    [persist]
  );

  const showLeave = leaveTarget !== null;
  const navigateAway = useCallback(
    () => router.push(leaveTarget ?? returnTo),
    [leaveTarget, returnTo, router]
  );
  const closeLeave = useCallback(() => setLeaveTarget(null), []);

  const requestClose = async (destination: string = returnTo) => {
    if (!hasMeaningfulContribution(snapshot)) {
      router.push(destination);
      return;
    }
    const saved = await flush();
    if (saved) router.push(destination);
    else setLeaveTarget(destination);
  };

  const publish = async () => {
    if (!contributionText(snapshot.content)) return;
    setPublishing(true);
    setPublishError(null);
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
        router.replace(`/post/${result.slug}?justPublished=1`);
      }
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "We couldn't finish this publication.");
      setPublishing(false);
    }
  };

  // Both recovery actions clear the key the copy actually came from, which is
  // not always this canvas's own key.
  const restoreRecovery = () => {
    if (!recovery) return null;
    localStorage.removeItem(recovery.key);
    setSnapshot(recovery.snapshot);
    setRecovery(null);
    return recovery.snapshot;
  };

  const dismissRecovery = () => {
    if (!recovery) return;
    localStorage.removeItem(recovery.key);
    setRecovery(null);
  };

  const discardDraft = async () => {
    if (localTimerRef.current) clearTimeout(localTimerRef.current);
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    discardedRef.current = true;
    setDiscarding(true);
    setSaveError(null);
    // An autosave already in flight may be creating the draft at this moment.
    // Waiting for it means the id deleted below is the one it created.
    await saveQueueRef.current.catch(() => undefined);

    let error: string | null = null;
    if (mode === "published-edit") {
      if (editDraftIdRef.current) {
        error = (await discardPublishedEditDraft({ editDraftId: editDraftIdRef.current })).error;
      }
    } else if (draftIdRef.current) {
      const result = await deleteOwnDraftPosts({ postIds: [draftIdRef.current] });
      if (!result.ok) error = result.error;
    }

    if (error) {
      discardedRef.current = false;
      if (mountedRef.current) {
        setSaveState("error");
        setSaveError(error);
        setDiscarding(false);
      }
      return false;
    }
    localStorage.removeItem(localKeyRef.current);
    router.push(mode === "published-edit" ? `/post/${publishedSlug}` : returnTo);
    return true;
  };

  // "Saved" is the resting state. Only the device-only case earns more words,
  // because it is the only one that carries a consequence for the writer. The
  // screens put an image upload ahead of this, because only they know of it.
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

  return {
    snapshot,
    setSnapshot,
    saveState,
    saveError,
    saveLabel,
    recovery,
    restoreRecovery,
    dismissRecovery,
    draftId,
    editDraftId,
    documentKey,
    flush,
    requestClose,
    navigateAway,
    showLeave,
    closeLeave,
    publish,
    publishing,
    publishError,
    discardDraft,
    discarding,
    bodyText,
    wordCount,
  };
}

export type ContributionDraft = ReturnType<typeof useContributionDraft>;
