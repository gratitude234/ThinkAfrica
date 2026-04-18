"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import slugify from "slugify";
import { createClient } from "@/lib/supabase/client";
import {
  composeContentWithSubtitle,
  extractSubtitleFromContent,
} from "./writeUtils";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface DraftData {
  title: string;
  subtitle: string;
  excerpt: string;
  content: string;
  tags: string[];
  postType: string;
  coverImageUrl: string;
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

const LS_KEY = "thinkafrika_draft_backup";
const AUTOSAVE_DELAY = 3000;
const LS_INTERVAL = 5000;

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
        const savedBackup = localStorage.getItem(LS_KEY);

        if (savedBackup) {
          const parsedBackup = JSON.parse(savedBackup) as Partial<DraftData>;
          const normalizedBackup: DraftData = {
            title: parsedBackup.title ?? "",
            subtitle: parsedBackup.subtitle ?? "",
            excerpt: parsedBackup.excerpt ?? "",
            content: parsedBackup.content ?? "",
            tags: parsedBackup.tags ?? [],
            postType: parsedBackup.postType ?? "blog",
            coverImageUrl: parsedBackup.coverImageUrl ?? "",
          };

          const hasContent =
            normalizedBackup.title.trim().length > 0 ||
            normalizedBackup.subtitle.trim().length > 0 ||
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
      .select("id, title, excerpt, content, tags, type, cover_image_url")
      .eq("id", draftIdParam)
      .eq("status", "draft")
      .single()
      .then(({ data }) => {
        if (data) {
          const parsedContent = extractSubtitleFromContent(data.content ?? "");

          setInitialData({
            title: data.title ?? "",
            subtitle: parsedContent.subtitle,
            excerpt: data.excerpt ?? "",
            content: parsedContent.content,
            tags: (data.tags as string[] | null) ?? [],
            postType: data.type ?? "blog",
            coverImageUrl:
              (data as { cover_image_url?: string | null }).cover_image_url ??
              "",
          });
        }
        setLoadingDraft(false);
      });
  }, [draftIdParam]);

  const dismissBackup = useCallback(() => {
    setLocalBackup(null);
    localStorage.removeItem(LS_KEY);
  }, []);

  const restoreFromBackup = useCallback(() => {
    if (!localBackup) return;

    latestDataRef.current = localBackup;
    setInitialData(localBackup);
    setLocalBackup(null);
    localStorage.removeItem(LS_KEY);
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
        setSaveStatus("saving");

        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setSaveStatus("error");
          return;
        }

        const tags = data.tags
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean);
        const contentWithSubtitle = composeContentWithSubtitle(
          data.content,
          data.subtitle
        );
        const currentDraftId = draftIdRef.current;

        if (currentDraftId) {
          const { error } = await supabase
            .from("posts")
            .update({
              title: data.title || "Untitled draft",
              excerpt: data.excerpt,
              content: contentWithSubtitle,
              tags,
              type: data.postType,
              cover_image_url: data.coverImageUrl || null,
            })
            .eq("id", currentDraftId)
            .eq("author_id", user.id);

          if (error) {
            setSaveStatus("error");
          } else {
            setSaveStatus("saved");
            setLastSaved(new Date());
          }
        } else {
          const baseSlug = slugify(data.title || "untitled", {
            lower: true,
            strict: true,
          });
          const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

          const { data: inserted, error } = await supabase
            .from("posts")
            .insert({
              author_id: user.id,
              title: data.title || "Untitled draft",
              slug: uniqueSlug,
              excerpt: data.excerpt,
              content: contentWithSubtitle,
              tags,
              type: data.postType,
              status: "draft",
              cover_image_url: data.coverImageUrl || null,
            })
            .select("id")
            .single();

          if (error || !inserted) {
            setSaveStatus("error");
          } else {
            draftIdRef.current = inserted.id;
            setDraftId(inserted.id);
            setSaveStatus("saved");
            setLastSaved(new Date());
            router.replace(`/write?draft=${inserted.id}`);
          }
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
