"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import ProfileGate from "@/components/ui/ProfileGate";
import { composerSurfaceFor, type ContentKind } from "@/lib/contentModel";
import type { ComposerMode, ContributionSnapshot } from "@/lib/contribution";
import ArticleEditor from "./ArticleEditor";
import PostComposer from "./PostComposer";
import { useContributionDraft } from "./useContributionDraft";
import { useModalFocus } from "./useModalFocus";

interface WriterProfile {
  full_name: string | null;
  username: string | null;
  university: string | null;
  avatar_url?: string | null;
}

interface UniversalComposerProps {
  mode: ComposerMode;
  userId: string;
  profile: WriterProfile | null;
  initialSnapshot: ContributionSnapshot;
  /** The screen asked for with `?editor=article`. A title overrides it. */
  initialSurface?: ContentKind | null;
  draftId?: string | null;
  editDraftId?: string | null;
  publishedPostId?: string | null;
  publishedSlug?: string | null;
  /** When the account copy was last written, so a stale device copy can be told apart from a newer one. */
  draftUpdatedAt?: string | null;
  returnTo: string;
}

/**
 * Keeps the chosen screen in the address beside any `draft` id, so a refresh
 * reopens the same one. Shallow, for the same reason the first autosave's
 * address update is: a server re-render would remount the editor under the
 * writer's cursor.
 */
function rememberSurface(surface: ContentKind) {
  const url = new URL(window.location.href);
  if (surface === "article") url.searchParams.set("editor", "article");
  else url.searchParams.delete("editor");
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

/**
 * The composer: the Post composer or the Article editor over one saving hook.
 * The writer chooses the screen, and a title still makes a piece an Article
 * (lib/contentModel.ts). This root holds only what both screens share: the
 * choice between them, the recovery notice, and the leave, discard and profile
 * dialogs.
 */
export default function UniversalComposer({
  mode,
  userId,
  profile: initialProfile,
  initialSnapshot,
  initialSurface = null,
  draftId = null,
  editDraftId = null,
  publishedPostId = null,
  publishedSlug = null,
  draftUpdatedAt = null,
  returnTo,
}: UniversalComposerProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [surface, setSurface] = useState<ContentKind>(() =>
    composerSurfaceFor({ title: initialSnapshot.title, requested: initialSurface })
  );
  // Back returns to the Post composer only for an Article started from it
  // during this visit.
  const [openedFromPost, setOpenedFromPost] = useState(false);
  const [showProfileGate, setShowProfileGate] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const afterProfileRef = useRef<(() => void) | null>(null);
  const leaveDialogRef = useRef<HTMLDivElement>(null);
  const discardDialogRef = useRef<HTMLDivElement>(null);

  const resetForDocument = useCallback(
    (next: ContributionSnapshot) => {
      setSurface(composerSurfaceFor({ title: next.title, requested: initialSurface }));
      setOpenedFromPost(false);
      setShowDiscard(false);
    },
    [initialSurface]
  );

  const draft = useContributionDraft({
    mode,
    userId,
    initialSnapshot,
    draftId,
    editDraftId,
    publishedPostId,
    publishedSlug,
    draftUpdatedAt,
    returnTo,
    onDocumentChange: resetForDocument,
  });

  // The Post composer has no title field, so it is never shown over a title
  // nobody could see or clear there. A title restored from a device copy or a
  // version moves the piece to the Article editor.
  const titled = Boolean(draft.snapshot.title.trim());
  useEffect(() => {
    if (!titled || surface === "article") return;
    setSurface("article");
    rememberSurface("article");
  }, [surface, titled]);
  const shown: ContentKind = titled ? "article" : surface;

  const switchToArticle = useCallback(() => {
    setSurface("article");
    setOpenedFromPost(true);
    rememberSurface("article");
  }, []);

  const handleBack = () => {
    if (openedFromPost && !titled) {
      setSurface("post");
      setOpenedFromPost(false);
      rememberSurface("post");
      return;
    }
    void draft.requestClose();
  };

  const withCompleteProfile = useCallback(
    (next: () => void) => {
      if (profile?.full_name?.trim() && profile.username?.trim()) {
        next();
        return;
      }
      afterProfileRef.current = next;
      setShowProfileGate(true);
    },
    [profile]
  );

  const closeDiscard = useCallback(() => setShowDiscard(false), []);
  const openDiscard = useCallback(() => setShowDiscard(true), []);
  useModalFocus(draft.showLeave, leaveDialogRef, draft.closeLeave);
  useModalFocus(showDiscard, discardDialogRef, closeDiscard, draft.discarding);

  const isEdit = mode === "published-edit";
  const authorName = profile?.full_name?.trim() || profile?.username?.trim() || "You";
  const avatarUrl = profile?.avatar_url ?? null;
  const username = profile?.username?.trim() || null;

  const notice = draft.recovery ? (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold-tint px-4 py-3 text-sm">
      <p className="text-gold-ink">This device has an unsaved copy of your writing.</p>
      <div className="flex gap-2">
        <button type="button" onClick={draft.restoreRecovery} className="min-h-11 rounded-lg bg-gold-ink px-4 font-semibold text-white">
          Restore
        </button>
        <button type="button" onClick={draft.dismissRecovery} className="min-h-11 rounded-lg px-3 font-semibold text-gold-ink">
          Discard
        </button>
      </div>
    </div>
  ) : null;

  const discardCopy = isEdit
    ? { title: "Discard your changes?", body: "Your live publication will stay unchanged.", action: "Discard changes" }
    : draft.draftId
      ? { title: "Discard this draft?", body: "It will be deleted from your drafts.", action: "Discard" }
      : { title: "Discard this writing?", body: "It will be cleared from this device.", action: "Discard" };

  return (
    // /edit/[slug] is full screen with no app navigation. /write sits under
    // the (write) layout's navigation from md up.
    <div className={isEdit ? "fixed inset-0 z-[70] overflow-y-auto bg-canvas" : undefined}>
      {shown === "article" ? (
        <ArticleEditor
          key={draft.documentKey}
          draft={draft}
          mode={mode}
          authorName={authorName}
          avatarUrl={avatarUrl}
          username={username}
          hasAppNav={!isEdit}
          autoFocusTitle={!titled}
          notice={notice}
          onBack={handleBack}
          onDiscard={openDiscard}
          withCompleteProfile={withCompleteProfile}
        />
      ) : (
        <PostComposer
          key={draft.documentKey}
          draft={draft}
          mode={mode}
          authorName={authorName}
          avatarUrl={avatarUrl}
          username={username}
          hasAppNav={!isEdit}
          notice={notice}
          onBack={() => void draft.requestClose()}
          onDiscard={openDiscard}
          onSwitchToArticle={switchToArticle}
          withCompleteProfile={withCompleteProfile}
        />
      )}

      {draft.showLeave ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/50 px-4">
          <div
            ref={leaveDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-title"
            className="w-full max-w-sm rounded-2xl bg-surface p-6 text-ink shadow-2xl"
          >
            <h2 id="leave-title" className="publication-article-title text-xl font-semibold">Your account copy didn’t save</h2>
            <p className="mt-2 text-sm text-ink-muted">This device still has a recovery copy.</p>
            <div className="mt-5 flex gap-3">
              <Button type="button" variant="secondary" onClick={draft.closeLeave} className="min-h-11 flex-1 rounded-md">
                Keep writing
              </Button>
              <Button type="button" variant="danger" onClick={() => draft.navigateAway()} className="min-h-11 flex-1 rounded-md">
                Leave with device copy
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showDiscard ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/50 px-4">
          <div
            ref={discardDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-title"
            aria-describedby="discard-body"
            className="w-full max-w-sm rounded-2xl bg-surface p-6 text-ink shadow-2xl"
          >
            <h2 id="discard-title" className="publication-article-title text-xl font-semibold">{discardCopy.title}</h2>
            <p id="discard-body" className="mt-2 text-sm text-ink-muted">{discardCopy.body}</p>
            <div className="mt-5 flex gap-3">
              <Button type="button" variant="secondary" onClick={closeDiscard} disabled={draft.discarding} className="min-h-11 flex-1 rounded-md">
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={draft.discarding}
                onClick={() => void draft.discardDraft()}
                className="min-h-11 flex-1 rounded-md"
              >
                {discardCopy.action}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showProfileGate ? (
        <ProfileGate
          open
          userId={userId}
          initialProfile={profile}
          onClose={() => {
            afterProfileRef.current = null;
            setShowProfileGate(false);
          }}
          onComplete={(next) => {
            setProfile((current) => ({ ...next, avatar_url: current?.avatar_url ?? null }));
            setShowProfileGate(false);
            const run = afterProfileRef.current;
            afterProfileRef.current = null;
            run?.();
          }}
        />
      ) : null}
    </div>
  );
}
