"use client";

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { trackActivationEvent } from "@/lib/activationEvents";
import { ensureDraft } from "./actions";
import type { PostType } from "@/lib/utils";
import {
  parseArticleFormat,
  resolveArticleFormat,
  resolveContentKind,
  type ArticleFormat,
} from "@/lib/contentModel";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface DraftData {
  title: string;
  excerpt: string;
  content: string;
  tags: string[];
  postType: string;
  articleFormat: ArticleFormat | null;
  coverImageUrl: string;
  inResponseToId: string | null;
}

export interface UseDraftManagerOptions {
  /** Explicitly scopes local recovery to the signed-in account. */
  userId?: string | null;
  /** Distinguishes new-draft intents before a server draft id exists. */
  contextKey?: string | null;
}

interface UseDraftManagerReturn {
  draftId: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  loadError: string | null;
  lastSaved: Date | null;
  saveDraft: (data: DraftData) => Promise<void>;
  /** Cancels debounce, serializes persistence, and returns the canonical id. */
  flushDraft: (data?: DraftData) => Promise<string | null>;
  /** Changes only when the editor moves to a genuinely different draft/intent. */
  editorSessionKey: number;
  /** Server-loaded draft id; null for a draft created in this mounted session. */
  loadedDraftId: string | null;
  initialData: DraftData | null;
  loadingDraft: boolean;
  loadingBackup: boolean;
  localBackup: DraftData | null;
  restoreFromBackup: () => void;
  dismissBackup: () => void;
  clearLocalBackup: () => void;
}

interface DraftBackupEnvelope {
  version: 2;
  savedAt: string;
  userId: string | null;
  draftId: string | null;
  contextKey: string;
  data: DraftData;
}

interface ParsedBackup {
  data: DraftData;
  savedAt: string | null;
}

const LEGACY_CURRENT_LS_KEY = "indegenius_draft_backup";
const LEGACY_BRAND_LS_KEY = "thinkafrica_draft_backup";
const SCOPED_LS_PREFIX = "indegenius:article-draft:v2";
const AUTOSAVE_DELAY = 3000;
const LOCAL_BACKUP_DELAY = 350;

function normalizeDraftData(value: Partial<DraftData> | null | undefined): DraftData {
  return {
    title: typeof value?.title === "string" ? value.title : "",
    excerpt: typeof value?.excerpt === "string" ? value.excerpt : "",
    content: typeof value?.content === "string" ? value.content : "",
    tags: Array.isArray(value?.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    postType: typeof value?.postType === "string" ? value.postType : "essay",
    articleFormat: parseArticleFormat(value?.articleFormat),
    coverImageUrl:
      typeof value?.coverImageUrl === "string" ? value.coverImageUrl : "",
    inResponseToId:
      typeof value?.inResponseToId === "string" ? value.inResponseToId : null,
  };
}

function hasMeaningfulDraft(data: DraftData) {
  const bodyText = data.content
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .trim();

  return (
    data.title.trim().length > 0 ||
    bodyText.length > 0 ||
    data.excerpt.trim().length > 0 ||
    data.tags.length > 0 ||
    data.coverImageUrl.trim().length > 0
  );
}

function parseBackup(raw: string | null): ParsedBackup | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as
      | Partial<DraftData>
      | Partial<DraftBackupEnvelope>;
    const envelope =
      parsed &&
      "version" in parsed &&
      parsed.version === 2 &&
      "data" in parsed &&
      parsed.data &&
      typeof parsed.data === "object"
        ? parsed
        : null;
    const data = normalizeDraftData(
      envelope
        ? (envelope.data as Partial<DraftData>)
        : (parsed as Partial<DraftData>)
    );

    if (!hasMeaningfulDraft(data)) return null;

    return {
      data,
      savedAt:
        envelope && typeof envelope.savedAt === "string"
          ? envelope.savedAt
          : null,
    };
  } catch {
    return null;
  }
}

function encodeScopePart(value: string) {
  return encodeURIComponent(value.trim() || "new");
}

export function getDraftBackupStorageKey(input: {
  userId?: string | null;
  draftId?: string | null;
  contextKey?: string | null;
}) {
  const owner = input.userId?.trim() || "anonymous";
  const context = input.draftId
    ? `draft:${input.draftId}`
    : input.contextKey?.trim() || "new";

  return `${SCOPED_LS_PREFIX}:${encodeScopePart(owner)}:${encodeScopePart(context)}`;
}

/**
 * Compatibility reader for page.tsx starter guards. It returns DraftData,
 * rather than the v2 envelope, while callers migrate to `localBackup`.
 */
export function readDraftBackupRaw(scope?: {
  userId?: string | null;
  draftId?: string | null;
  contextKey?: string | null;
}): string | null {
  try {
    const keys = scope
      ? [getDraftBackupStorageKey(scope)]
      : [LEGACY_CURRENT_LS_KEY, LEGACY_BRAND_LS_KEY];

    for (const key of keys) {
      const parsed = parseBackup(localStorage.getItem(key));
      if (parsed) return JSON.stringify(parsed.data);
    }
  } catch {
    // Storage can be unavailable in private browsing or constrained webviews.
  }

  return null;
}

function createBackupEnvelope(input: {
  data: DraftData;
  userId: string | null;
  draftId: string | null;
  contextKey: string;
}): DraftBackupEnvelope {
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    userId: input.userId,
    draftId: input.draftId,
    contextKey: input.contextKey,
    data: input.data,
  };
}

function writeBackup(
  key: string,
  input: {
    data: DraftData;
    userId: string | null;
    draftId: string | null;
    contextKey: string;
  }
) {
  try {
    localStorage.setItem(key, JSON.stringify(createBackupEnvelope(input)));
    return true;
  } catch {
    return false;
  }
}

function removeBackupKeys(keys: Iterable<string>) {
  try {
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Server persistence remains authoritative when storage is unavailable.
  }
}

function draftDataMatches(left: DraftData, right: DraftData) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function useDraftManager(
  options: UseDraftManagerOptions = {}
): UseDraftManagerReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftIdParam = searchParams.get("draft");
  const responseIdParam = searchParams.get("inResponseTo");
  const responseSlugParam = searchParams.get("response_to");
  const starterParam = searchParams.get("starter");
  const starterTagParam = searchParams.get("tag");

  const inferredContextKey = responseIdParam
    ? `response:${responseIdParam}`
    : responseSlugParam
      ? `response-slug:${responseSlugParam}`
      : starterParam || starterTagParam
        ? `starter:${starterParam ?? "default"}:${starterTagParam ?? ""}`
        : "new";
  const contextKey = options.contextKey?.trim() || inferredContextKey;

  const [resolvedUserId, setResolvedUserId] = useState<string | null>(
    options.userId ?? null
  );
  const [authScopeResolved, setAuthScopeResolved] = useState(
    options.userId !== undefined
  );
  const scopedUserId =
    options.userId !== undefined ? options.userId : resolvedUserId;

  const [draftId, setDraftId] = useState<string | null>(draftIdParam);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [editorSessionKey, setEditorSessionKey] = useState(0);
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<DraftData | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(!!draftIdParam);
  const [loadedBackupKey, setLoadedBackupKey] = useState<string | null>(null);
  const [localBackup, setLocalBackup] = useState<DraftData | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localBackupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLocalDataRef = useRef<DraftData | null>(null);
  const latestDataRef = useRef<DraftData | null>(null);
  const loadedServerDataRef = useRef<DraftData | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const editRevisionRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const loadRequestRef = useRef(0);
  const identityGenerationRef = useRef(0);
  const pendingCanonicalRouteIdRef = useRef<string | null>(null);
  const skipCanonicalLoadIdRef = useRef<string | null>(null);

  // Prefer the route value while navigation is changing from one draft to
  // another; prefer state while a newly created id is waiting for replace().
  const backupDraftId = draftIdParam ?? draftId;
  const backupKey = getDraftBackupStorageKey({
    userId: scopedUserId,
    draftId: backupDraftId,
    contextKey,
  });
  const backupKeyRef = useRef(backupKey);
  const backupScopeRef = useRef({
    key: backupKey,
    userId: scopedUserId ?? null,
    draftId: backupDraftId,
    contextKey,
  });
  const knownBackupKeysRef = useRef(new Set<string>([backupKey]));
  const pendingLegacyRecoveryRef = useRef<{
    scopeKey: string;
    keys: Set<string>;
  } | null>(null);
  const loadingBackup =
    !authScopeResolved || loadingDraft || loadedBackupKey !== backupKey;
  const routeIdentity = draftIdParam
    ? `draft:${draftIdParam}`
    : `context:${contextKey}`;
  const routeIdentityRef = useRef(routeIdentity);

  const flushPendingLocalBackup = useCallback(() => {
    if (localBackupTimer.current) {
      clearTimeout(localBackupTimer.current);
      localBackupTimer.current = null;
    }

    const pending = pendingLocalDataRef.current;
    if (!pending) return;

    const scope = backupScopeRef.current;
    knownBackupKeysRef.current.add(scope.key);
    if (
      writeBackup(scope.key, {
        data: pending,
        userId: scope.userId,
        draftId: scope.draftId,
        contextKey: scope.contextKey,
      })
    ) {
      pendingLocalDataRef.current = null;
    }
  }, []);

  const scheduleLocalBackup = useCallback(
    (data: DraftData) => {
      pendingLocalDataRef.current = data;
      if (localBackupTimer.current) clearTimeout(localBackupTimer.current);
      localBackupTimer.current = setTimeout(
        flushPendingLocalBackup,
        LOCAL_BACKUP_DELAY
      );
    },
    [flushPendingLocalBackup]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      flushPendingLocalBackup();
    };
  }, [flushPendingLocalBackup]);

  useEffect(() => {
    const handlePageHide = () => flushPendingLocalBackup();
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [flushPendingLocalBackup]);

  useLayoutEffect(() => {
    const acknowledgesNewDraft =
      !!draftIdParam && pendingCanonicalRouteIdRef.current === draftIdParam;

    if (acknowledgesNewDraft) {
      pendingCanonicalRouteIdRef.current = null;
      skipCanonicalLoadIdRef.current = draftIdParam;
    } else if (routeIdentityRef.current !== routeIdentity) {
      // Commit the old identity's final device snapshot before switching the
      // backup scope and clearing its in-memory data.
      flushPendingLocalBackup();
      pendingCanonicalRouteIdRef.current = null;
      identityGenerationRef.current += 1;
      loadRequestRef.current += 1;
      // A new route identity must not wait behind a hung request for the old
      // draft. Generation guards keep the old operation from reclaiming UI.
      saveQueueRef.current = Promise.resolve();
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      pendingLegacyRecoveryRef.current = null;
      latestDataRef.current = null;
      loadedServerDataRef.current = null;
      editRevisionRef.current = 0;
      draftIdRef.current = null;
      setEditorSessionKey((current) => current + 1);
      setLoadedDraftId(null);
      setDraftId(draftIdParam);
      setInitialData(null);
      setLocalBackup(null);
      setLoadError(null);
      setSaveError(null);
      setSaveStatus("idle");
      setLastSaved(null);
      setLoadingDraft(Boolean(draftIdParam));
    }

    routeIdentityRef.current = routeIdentity;
  }, [draftIdParam, flushPendingLocalBackup, routeIdentity]);

  useEffect(() => {
    if (options.userId !== undefined) {
      setResolvedUserId(options.userId);
      setAuthScopeResolved(true);
      return;
    }

    let cancelled = false;
    const supabase = createClient();
    const auth = supabase.auth;

    if (!auth || typeof auth.getUser !== "function") {
      setAuthScopeResolved(true);
      return;
    }

    void auth
      .getUser()
      .then(({ data }) => {
        if (!cancelled) setResolvedUserId(data.user?.id ?? null);
      })
      .catch(() => {
        // Anonymous scoping is still safer than a global recovery key.
      })
      .finally(() => {
        if (!cancelled) setAuthScopeResolved(true);
      });

    return () => {
      cancelled = true;
    };
  }, [options.userId]);

  useEffect(() => {
    const previousScope = backupScopeRef.current;
    if (previousScope.key === backupKey) return;

    flushPendingLocalBackup();
    pendingLegacyRecoveryRef.current = null;

    const accountScopeChanged =
      previousScope.draftId === backupDraftId &&
      previousScope.contextKey === contextKey;
    const promotedToCanonicalDraft =
      !previousScope.draftId &&
      !!backupDraftId &&
      draftIdRef.current === backupDraftId;
    const shouldMigrate = accountScopeChanged || promotedToCanonicalDraft;

    let previousBackup: ParsedBackup | null = null;
    try {
      previousBackup = parseBackup(localStorage.getItem(previousScope.key));
    } catch {
      // Leave the old scope untouched if storage cannot be read.
    }
    if (shouldMigrate && previousBackup) {
      const copied = writeBackup(backupKey, {
        data: previousBackup.data,
        userId: scopedUserId ?? null,
        draftId: draftIdRef.current,
        contextKey,
      });
      if (copied) removeBackupKeys([previousScope.key]);
    }

    backupKeyRef.current = backupKey;
    backupScopeRef.current = {
      key: backupKey,
      userId: scopedUserId ?? null,
      draftId: backupDraftId,
      contextKey,
    };
    if (shouldMigrate) {
      knownBackupKeysRef.current.add(previousScope.key);
      knownBackupKeysRef.current.add(backupKey);
    } else {
      // A different route draft is a different recovery boundary. Publishing
      // or dismissing it must not erase another draft's offline work.
      knownBackupKeysRef.current = new Set([backupKey]);
    }
  }, [
    backupDraftId,
    backupKey,
    contextKey,
    flushPendingLocalBackup,
    scopedUserId,
  ]);

  useEffect(() => {
    const requestId = ++loadRequestRef.current;
    setLoadError(null);
    setInitialData(null);
    setLoadedDraftId(null);
    loadedServerDataRef.current = null;

    if (!draftIdParam) {
      draftIdRef.current = null;
      setDraftId(null);
      setSaveStatus("idle");
      setSaveError(null);
      setLastSaved(null);
      setLoadingDraft(false);
      return;
    }

    // A replace after first save only synchronizes the address bar. Reloading
    // that row could overwrite keystrokes entered during the route transition.
    if (skipCanonicalLoadIdRef.current === draftIdParam) {
      skipCanonicalLoadIdRef.current = null;
      draftIdRef.current = draftIdParam;
      setDraftId(draftIdParam);
      setLoadingDraft(false);
      return;
    }

    setSaveStatus("idle");
    setSaveError(null);
    setLastSaved(null);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }

    // Do not trust a URL id as an autosave target until RLS confirms the row.
    draftIdRef.current = null;
    setDraftId(draftIdParam);
    setLoadingDraft(true);

    const supabase = createClient();
    const loadRequest = supabase
      .from("posts")
      .select(
        "id, title, excerpt, content, tags, type, content_kind, article_format, cover_image_url, in_response_to"
      )
      .eq("id", draftIdParam)
      .eq("status", "draft")
      .single();
    void Promise.resolve(loadRequest)
      .then(({ data, error }) => {
        if (!mountedRef.current || requestId !== loadRequestRef.current) return;

        if (data && resolveContentKind(data) !== "article") {
          draftIdRef.current = null;
          setDraftId(null);
          setLoadedDraftId(null);
          setLoadError(
            "This is not an Article draft. Open it from its own composer."
          );
        } else if (data) {
          const loadedData = normalizeDraftData({
            title: data.title ?? "",
            excerpt: data.excerpt ?? "",
            content: data.content ?? "",
            tags: (data.tags as string[] | null) ?? [],
            postType: data.type ?? "blog",
            articleFormat: resolveArticleFormat(data),
            coverImageUrl:
              (data as { cover_image_url?: string | null }).cover_image_url ?? "",
            inResponseToId:
              (data as { in_response_to?: string | null }).in_response_to ?? null,
          });

          draftIdRef.current = draftIdParam;
          setDraftId(draftIdParam);
          setLoadedDraftId(draftIdParam);
          setInitialData(loadedData);
          loadedServerDataRef.current = loadedData;
          latestDataRef.current = loadedData;
        } else {
          draftIdRef.current = null;
          setDraftId(null);
          setLoadedDraftId(null);
          setLoadError(
            error?.message ||
              "This draft could not be opened. It may have been published, removed, or belong to another account."
          );
        }
        setLoadingDraft(false);
      })
      .catch(() => {
        if (!mountedRef.current || requestId !== loadRequestRef.current) return;
        draftIdRef.current = null;
        setDraftId(null);
        setLoadedDraftId(null);
        setLoadError("We couldn't load this draft. Check your connection and try again.");
        setLoadingDraft(false);
      });
  }, [draftIdParam, routeIdentity]);

  useEffect(() => {
    if (!authScopeResolved || loadingDraft) return;

    let parsed: ParsedBackup | null = null;
    try {
      parsed = parseBackup(localStorage.getItem(backupKey));
    } catch {
      setLoadedBackupKey(backupKey);
      return;
    }
    pendingLegacyRecoveryRef.current = null;

    // Legacy globals had neither owner nor intent. Migrate them only into a
    // standalone new Article, never into an existing draft or response. The
    // actual ownership migration waits for explicit Restore/Discard action.
    if (!parsed && !draftIdParam && contextKey === "new") {
      try {
        const currentLegacy = parseBackup(
          localStorage.getItem(LEGACY_CURRENT_LS_KEY)
        );
        const brandLegacy = parseBackup(
          localStorage.getItem(LEGACY_BRAND_LS_KEY)
        );
        parsed = currentLegacy ?? brandLegacy;
        const legacyKeys = new Set<string>();
        if (currentLegacy) {
          legacyKeys.add(LEGACY_CURRENT_LS_KEY);
          if (
            brandLegacy &&
            draftDataMatches(currentLegacy.data, brandLegacy.data)
          ) {
            legacyKeys.add(LEGACY_BRAND_LS_KEY);
          }
        } else if (brandLegacy) {
          legacyKeys.add(LEGACY_BRAND_LS_KEY);
        }
        if (parsed && legacyKeys.size > 0) {
          pendingLegacyRecoveryRef.current = {
            scopeKey: backupKey,
            keys: legacyKeys,
          };
        }
      } catch {
        // Keep the global value intact if it cannot be read.
      }
    }

    if (!parsed) {
      setLocalBackup(null);
      setLoadedBackupKey(backupKey);
      return;
    }

    if (
      loadedServerDataRef.current &&
      draftDataMatches(parsed.data, loadedServerDataRef.current)
    ) {
      removeBackupKeys([backupKey]);
      setLocalBackup(null);
      setLoadedBackupKey(backupKey);
      return;
    }

    setLocalBackup(parsed.data);
    setLoadedBackupKey(backupKey);
  }, [
    authScopeResolved,
    backupKey,
    contextKey,
    draftIdParam,
    loadedDraftId,
    loadingDraft,
    scopedUserId,
  ]);

  const clearLocalBackup = useCallback(() => {
    if (localBackupTimer.current) {
      clearTimeout(localBackupTimer.current);
      localBackupTimer.current = null;
    }
    pendingLocalDataRef.current = null;
    const keys = new Set(knownBackupKeysRef.current);
    keys.add(backupKeyRef.current);
    const pendingLegacy = pendingLegacyRecoveryRef.current;
    if (pendingLegacy?.scopeKey === backupKeyRef.current) {
      for (const key of pendingLegacy.keys) keys.add(key);
      pendingLegacyRecoveryRef.current = null;
    }
    removeBackupKeys(keys);
    setLocalBackup(null);
  }, [setLocalBackup]);

  const dismissBackup = useCallback(() => {
    clearLocalBackup();
  }, [clearLocalBackup]);

  const restoreFromBackup = useCallback(() => {
    if (!localBackup) return;

    latestDataRef.current = localBackup;
    editRevisionRef.current += 1;
    const pendingLegacy = pendingLegacyRecoveryRef.current;
    if (pendingLegacy?.scopeKey === backupKeyRef.current) {
      const copied = writeBackup(backupKeyRef.current, {
        data: localBackup,
        userId: scopedUserId ?? null,
        draftId: draftIdRef.current,
        contextKey,
      });
      if (copied) {
        removeBackupKeys(pendingLegacy.keys);
        pendingLegacyRecoveryRef.current = null;
        knownBackupKeysRef.current.add(backupKeyRef.current);
      }
    }
    setInitialData({ ...localBackup });
    setLocalBackup(null);
    // Keep the scoped recovery copy until this snapshot reaches the server.
  }, [
    contextKey,
    localBackup,
    scopedUserId,
    setInitialData,
    setLocalBackup,
  ]);

  const replaceWithCanonicalDraftUrl = useCallback(
    (canonicalDraftId: string) => {
      let params: URLSearchParams;
      try {
        params = new URLSearchParams(searchParams.toString());
      } catch {
        params = new URLSearchParams();
      }
      params.set("draft", canonicalDraftId);
      router.replace(`/write?${params.toString()}`);
    },
    [router, searchParams]
  );

  const enqueuePersist = useCallback(
    (data: DraftData, revision: number): Promise<string | null> => {
      const requestedGeneration = identityGenerationRef.current;
      setSaveStatus("saving");
      setSaveError(null);

      const operation = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (
            !mountedRef.current ||
            requestedGeneration !== identityGenerationRef.current
          ) {
            return null;
          }

          const targetDraftId = draftIdRef.current;
          try {
            const result = await ensureDraft({
              draftId: targetDraftId,
              title: data.title,
              excerpt: data.excerpt,
              content: data.content,
              tags: data.tags,
              postType: data.postType as PostType,
              articleFormat: data.articleFormat,
              coverImageUrl: data.coverImageUrl,
              inResponseTo: data.inResponseToId,
            });

            if (
              !mountedRef.current ||
              requestedGeneration !== identityGenerationRef.current
            ) {
              return null;
            }

            if (result.error || !result.draftId) {
              setSaveStatus("error");
              setSaveError(result.error || "We couldn't save this draft.");
              return null;
            }

            const isNewDraft = !targetDraftId;
            const persistedLatestSnapshot =
              editRevisionRef.current === revision;
            if (isNewDraft) {
              const previousBackupKey = backupKeyRef.current;
              const canonicalBackupKey = getDraftBackupStorageKey({
                userId: scopedUserId,
                draftId: result.draftId,
                contextKey,
              });
              const latest = latestDataRef.current;

              knownBackupKeysRef.current.add(previousBackupKey);
              knownBackupKeysRef.current.add(canonicalBackupKey);
              if (
                !persistedLatestSnapshot &&
                latest &&
                hasMeaningfulDraft(latest)
              ) {
                const copied = writeBackup(canonicalBackupKey, {
                  data: latest,
                  userId: scopedUserId ?? null,
                  draftId: result.draftId,
                  contextKey,
                });
                if (copied) removeBackupKeys([previousBackupKey]);
              } else {
                removeBackupKeys([previousBackupKey, canonicalBackupKey]);
              }

              // Promote the recovery scope before setDraftId() renders the
              // canonical key, making the scope effect a no-op rather than a
              // chance to recreate a just-cleared backup.
              backupKeyRef.current = canonicalBackupKey;
              backupScopeRef.current = {
                key: canonicalBackupKey,
                userId: scopedUserId ?? null,
                draftId: result.draftId,
                contextKey,
              };
              if (mountedRef.current) {
                setLoadedBackupKey(canonicalBackupKey);
              }
            } else if (persistedLatestSnapshot) {
              removeBackupKeys([backupKeyRef.current]);
            }

            draftIdRef.current = result.draftId;
            if (isNewDraft) {
              pendingCanonicalRouteIdRef.current = result.draftId;
            }

            if (mountedRef.current) {
              setDraftId(result.draftId);
              setLastSaved(new Date());
              if (persistedLatestSnapshot) setLocalBackup(null);
              setSaveStatus(
                persistedLatestSnapshot
                  ? "saved"
                  : latestDataRef.current?.title.trim()
                    ? "saving"
                    : "idle"
              );
              setSaveError(null);
            }

            if (isNewDraft) {
              try {
                trackActivationEvent({
                  event: "draft_started",
                  metadata: { draftId: result.draftId, postType: data.postType },
                });
              } catch {
                // Analytics must never turn a confirmed save into a failure.
              }
              try {
                replaceWithCanonicalDraftUrl(result.draftId);
              } catch {
                // The canonical id is already held in state/ref; a later
                // navigation can recover even if URL replacement is blocked.
              }
            }

            return result.draftId;
          } catch (error) {
            if (
              mountedRef.current &&
              requestedGeneration === identityGenerationRef.current
            ) {
              setSaveStatus("error");
              setSaveError(
                error instanceof Error
                  ? error.message
                  : "We couldn't save this draft."
              );
            }
            return null;
          }
        });

      saveQueueRef.current = operation.then(
        () => undefined,
        () => undefined
      );
      return operation;
    },
    [
      replaceWithCanonicalDraftUrl,
      setDraftId,
      setLastSaved,
      setLoadedBackupKey,
      setLocalBackup,
      setSaveError,
      setSaveStatus,
      scopedUserId,
      contextKey,
    ]
  );

  const saveDraft = useCallback(
    async (data: DraftData) => {
      latestDataRef.current = data;
      const revision = ++editRevisionRef.current;
      scheduleLocalBackup(data);

      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      // Article rows require a real title. Body-only work remains protected
      // locally until a title makes server persistence valid.
      if (!data.title.trim()) {
        setSaveStatus("idle");
        setSaveError(null);
        debounceTimer.current = null;
        return;
      }

      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null;
        void enqueuePersist(data, revision);
      }, AUTOSAVE_DELAY);
    },
    [enqueuePersist, scheduleLocalBackup, setSaveError, setSaveStatus]
  );

  const flushDraft = useCallback(
    async (data?: DraftData) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }

      const snapshot = data ?? latestDataRef.current;
      if (!snapshot) return draftIdRef.current;

      let revision = editRevisionRef.current;
      if (data) {
        latestDataRef.current = data;
        revision = ++editRevisionRef.current;
        pendingLocalDataRef.current = data;
      }
      flushPendingLocalBackup();

      if (!snapshot.title.trim()) {
        setSaveStatus("idle");
        setSaveError(null);
        return draftIdRef.current;
      }

      return enqueuePersist(snapshot, revision);
    },
    [enqueuePersist, flushPendingLocalBackup, setSaveError, setSaveStatus]
  );

  return {
    draftId,
    saveStatus,
    saveError,
    loadError,
    lastSaved,
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
  };
}
