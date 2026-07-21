"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { trackActivationEvent } from "@/lib/activationEvents";
import { ensureDraft } from "./actions";
import type { PostType } from "@/lib/utils";
import { resolveArticleFormat, type ArticleFormat } from "@/lib/contentModel";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface DraftData {
  title: string;
  excerpt: string;
  content: string;
  tags: string[];
  postType: string;
  // Phase 4A: optional Article genre, lifted to page.tsx state (mirroring
  // postType) and hydrated from the loaded draft's own stored value -- see
  // page.tsx and PublishDrawer.tsx. null means "General"; every DraftData
  // snapshot always carries a concrete value (never omitted), so
  // saveDraft() always tells ensureDraft() exactly what to persist.
  articleFormat: ArticleFormat | null;
  coverImageUrl: string;
  inResponseToId: string | null;
}

interface UseDraftManagerReturn {
  draftId: string | null;
  saveStatus: SaveStatus;
  lastSaved: Date | null;
  saveDraft: (data: DraftData) => Promise<void>;
  initialData: DraftData | null;
  loadingDraft: boolean;
  localBackup: DraftData | null;
  restoreFromBackup: () => void;
  dismissBackup: () => void;
}

const LS_KEY = "indegenius_draft_backup";
const LEGACY_LS_KEY = "thinkafrica_draft_backup";
const AUTOSAVE_DELAY = 3000;
const LS_INTERVAL = 5000;

// Dual-read: new key first, then fall back to the pre-rebrand key and migrate
// its value forward. The legacy key is never deleted outright, only replaced
// once its value has been copied under the new name.
export function readDraftBackupRaw(): string | null {
  try {
    const current = localStorage.getItem(LS_KEY);
    if (current) return current;

    const legacy = localStorage.getItem(LEGACY_LS_KEY);
    if (legacy) {
      localStorage.setItem(LS_KEY, legacy);
      return legacy;
    }
  } catch {
    // ignore storage errors
  }

  return null;
}

// Only clears the new key. The legacy key is intentionally left in place —
// per the migration requirement, it is never deleted outright by this code.
function clearDraftBackupRaw() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore storage errors
  }
}

export function useDraftManager(): UseDraftManagerReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftIdParam = searchParams.get("draft");

  const [draftId, setDraftId] = useState<string | null>(draftIdParam);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [initialData, setInitialData] = useState<DraftData | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(!!draftIdParam);
  const [localBackup, setLocalBackup] = useState<DraftData | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestDataRef = useRef<DraftData | null>(null);
  const draftIdRef = useRef<string | null>(draftIdParam);

  useEffect(() => {
    if (!draftIdParam) {
      try {
        const savedBackup = readDraftBackupRaw();

        if (savedBackup) {
          const parsedBackup = JSON.parse(savedBackup) as Partial<DraftData>;
          const normalizedBackup: DraftData = {
            title: parsedBackup.title ?? "",
            excerpt: parsedBackup.excerpt ?? "",
            content: parsedBackup.content ?? "",
            tags: parsedBackup.tags ?? [],
            postType: parsedBackup.postType ?? "blog",
            articleFormat: parsedBackup.articleFormat ?? null,
            coverImageUrl: parsedBackup.coverImageUrl ?? "",
            inResponseToId: parsedBackup.inResponseToId ?? null,
          };

          const hasContent =
            normalizedBackup.title.trim().length > 0 ||
            normalizedBackup.content.trim().length > 0;

          if (hasContent) {
            setLocalBackup(normalizedBackup);
          }
        }
      } catch {
        // ignore invalid local backup data
      }

      setLoadingDraft(false);
      return;
    }

    const supabase = createClient();
    supabase
      .from("posts")
      .select(
        "id, title, excerpt, content, tags, type, content_kind, article_format, cover_image_url, in_response_to"
      )
      .eq("id", draftIdParam)
      .eq("status", "draft")
      .single()
      .then(({ data }) => {
        if (data) {
          setInitialData({
            title: data.title ?? "",
            excerpt: data.excerpt ?? "",
            content: data.content ?? "",
            tags: (data.tags as string[] | null) ?? [],
            postType: data.type ?? "blog",
            // Caught in review: load the draft's own stored genre so
            // PublishDrawer can hydrate from it instead of always resetting
            // to "General" -- see resolveArticleFormat() in
            // lib/contentModel.ts (prefers content_kind/article_format,
            // falls back to legacy `type`).
            articleFormat: resolveArticleFormat(data),
            coverImageUrl:
              (data as { cover_image_url?: string | null }).cover_image_url ??
              "",
            inResponseToId:
              (data as { in_response_to?: string | null }).in_response_to ?? null,
          });
        } else {
          // The `draft=` URL param doesn't resolve to a row this user can
          // still edit as a draft here (wrong owner, wrong status -- e.g. it
          // was since published/submitted/removed -- or it never existed).
          // Forget it entirely rather than leaving it in draftIdRef: autosave
          // must never fall through to updating an arbitrary post merely
          // because a stale/forged id was sitting in the URL.
          draftIdRef.current = null;
          setDraftId(null);
        }
        setLoadingDraft(false);
      });
  }, [draftIdParam]);

  const dismissBackup = useCallback(() => {
    setLocalBackup(null);
    clearDraftBackupRaw();
  }, []);

  const restoreFromBackup = useCallback(() => {
    if (!localBackup) return;

    latestDataRef.current = localBackup;
    setInitialData(localBackup);
    setLocalBackup(null);
    clearDraftBackupRaw();
  }, [localBackup]);

  useEffect(() => {
    lsTimer.current = setInterval(() => {
      if (latestDataRef.current) {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(latestDataRef.current));
        } catch {
          // ignore storage errors
        }
      }
    }, LS_INTERVAL);

    return () => {
      if (lsTimer.current) clearInterval(lsTimer.current);
    };
  }, []);

  const saveDraft = useCallback(
    async (data: DraftData) => {
      latestDataRef.current = data;

      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      debounceTimer.current = setTimeout(async () => {
        // A generic Article always requires a non-blank title (see
        // posts_title_required_unless_post_check in the Phase 2 migration).
        // Before that title exists, there is nothing safe to persist to the
        // "posts" row itself -- attempting to would either violate that
        // constraint or force a fake placeholder title into it. The
        // periodic localStorage backup (below) is what protects this work
        // in the meantime; remote persistence simply waits.
        if (!data.title.trim()) {
          return;
        }

        setSaveStatus("saving");

        // Routed through the same server action /write's "ready to publish"
        // step uses, rather than writing to Supabase directly from the
        // browser: ensureDraft() independently verifies ownership, refuses
        // to touch a draftId that isn't actually still an editable draft
        // (e.g. one that was since published or submitted for review), and
        // sanitizes content -- guarantees a raw client `.update()` call here
        // could not provide on its own.
        const result = await ensureDraft({
          draftId: draftIdRef.current,
          title: data.title,
          excerpt: data.excerpt,
          content: data.content,
          tags: data.tags,
          postType: data.postType as PostType,
          articleFormat: data.articleFormat,
          coverImageUrl: data.coverImageUrl,
          inResponseTo: data.inResponseToId,
        });

        if (result.error || !result.draftId) {
          setSaveStatus("error");
          return;
        }

        const isNewDraft = !draftIdRef.current;
        draftIdRef.current = result.draftId;
        setDraftId(result.draftId);
        setSaveStatus("saved");
        setLastSaved(new Date());

        if (isNewDraft) {
          trackActivationEvent({
            event: "draft_started",
            metadata: { draftId: result.draftId, postType: data.postType },
          });
          router.replace(`/write?draft=${result.draftId}`);
        }
      }, AUTOSAVE_DELAY);
    },
    [router]
  );

  return {
    draftId,
    saveStatus,
    lastSaved,
    saveDraft,
    initialData,
    loadingDraft,
    localBackup,
    restoreFromBackup,
    dismissBackup,
  };
}
