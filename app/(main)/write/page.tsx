"use client";

import Link from "next/link";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
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

interface DraftPayload {
  title: string;
  subtitle: string;
  excerpt: string;
  content: string;
  tags: string[];
  postType: PostType;
  coverImageUrl: string;
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
  const [postType, setPostType] = useState<PostType>("blog");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [references, setReferences] = useState<PostReferenceRecord[]>([]);
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
      setWordCount(countWords(initialData.content));
    }
  }, [initialData]);

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
    }),
    [title, subtitle, excerpt, content, tags, postType, coverImageUrl]
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
    }) => {
      if (changes.postType) setPostType(changes.postType);
      if (changes.tags) setTags(changes.tags);
      if (typeof changes.coverImageUrl === "string") {
        setCoverImageUrl(changes.coverImageUrl);
      }
      if (typeof changes.excerpt === "string") {
        setExcerpt(changes.excerpt);
      }

      void saveDraft(
        getCurrentData({
          postType: changes.postType,
          tags: changes.tags,
          coverImageUrl: changes.coverImageUrl,
          excerpt: changes.excerpt,
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
          ThinkAfrika
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
            Ready to publish →
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

      <div className="space-y-4">
        <div>
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
        </div>
      </div>

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
