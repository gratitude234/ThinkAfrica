"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Toast from "@/components/ui/Toast";
import {
  setAuthorSubscription,
  toggleFollow,
} from "@/components/ui/followActions";
import { trackActivationEvent } from "@/lib/activationEvents";
import type {
  AuthorRelationshipState,
  AuthorRelationshipSurface,
} from "@/lib/publicationDelivery";

const NUDGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const PENDING_INTENT_KEY = "indegenius:author-relationship-intent";

interface PendingIntent {
  authorId: string;
  action: "follow" | "subscribe";
  source: AuthorRelationshipSurface;
  postId: string | null;
}

interface ToastState {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  durationMs?: number;
}

interface AuthorRelationshipContextValue extends AuthorRelationshipState {
  authorId: string;
  authorName: string;
  currentUserId: string | null;
  pending: "follow" | "subscription" | null;
  error: string | null;
  requestFollowChange: (source: AuthorRelationshipSurface) => void;
  requestSubscriptionChange: (source: AuthorRelationshipSurface) => void;
  offerQualifiedReadNudge: () => void;
}

const AuthorRelationshipContext =
  createContext<AuthorRelationshipContextValue | null>(null);

function nudgeStorageKey(userId: string, authorId: string) {
  return `indegenius:author-subscription-nudge:${userId}:${authorId}`;
}

function safeSessionWrite(intent: PendingIntent) {
  try {
    window.sessionStorage.setItem(PENDING_INTENT_KEY, JSON.stringify(intent));
  } catch {
    // A disabled storage API must never block authentication.
  }
}

function readPendingIntent(): PendingIntent | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_INTENT_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PENDING_INTENT_KEY);
    const value = JSON.parse(raw) as Partial<PendingIntent>;
    if (
      typeof value.authorId !== "string" ||
      (value.action !== "follow" && value.action !== "subscribe")
    ) {
      return null;
    }
    return {
      authorId: value.authorId,
      action: value.action,
      source: value.source ?? "unknown",
      postId: typeof value.postId === "string" ? value.postId : null,
    };
  } catch {
    return null;
  }
}

export default function AuthorRelationshipProvider({
  authorId,
  authorName,
  currentUserId,
  initialFollowing,
  initialSubscribed,
  postId = null,
  children,
}: {
  authorId: string;
  authorName: string;
  currentUserId: string | null;
  initialFollowing: boolean;
  initialSubscribed: boolean;
  postId?: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [following, setFollowing] = useState(initialFollowing);
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [pending, setPending] = useState<
    "follow" | "subscription" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirmSource, setConfirmSource] =
    useState<AuthorRelationshipSurface | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const runSubscriptionRef = useRef<
    | ((
        nextSubscribed: boolean,
        source: AuthorRelationshipSurface
      ) => Promise<void>)
    | null
  >(null);

  const destination = `${pathname}${
    searchParams.toString() ? `?${searchParams}` : ""
  }`;

  const requireLogin = useCallback(
    (
      action: PendingIntent["action"],
      source: AuthorRelationshipSurface
    ) => {
      safeSessionWrite({ authorId, action, source, postId });
      router.push(`/login?redirectTo=${encodeURIComponent(destination)}`);
    },
    [authorId, destination, postId, router]
  );

  const closeToast = useCallback(() => {
    setToast((current) => {
      current?.onDismiss?.();
      return null;
    });
  }, []);

  const recordNudgeCooldown = useCallback(() => {
    if (!currentUserId) return;
    try {
      window.localStorage.setItem(
        nudgeStorageKey(currentUserId, authorId),
        String(Date.now() + NUDGE_COOLDOWN_MS)
      );
    } catch {
      // The prompt can still work for this session when storage is disabled.
    }
  }, [authorId, currentUserId]);

  const runSubscription = useCallback(
    async (
      nextSubscribed: boolean,
      source: AuthorRelationshipSurface
    ) => {
      if (!currentUserId) {
        requireLogin("subscribe", source);
        return;
      }
      if (pending) return;

      const previous = { following, subscribed };
      setSubscribed(nextSubscribed);
      if (nextSubscribed) setFollowing(true);
      setPending("subscription");
      setError(null);
      setToast(null);

      try {
        const result = await setAuthorSubscription({
          authorId,
          subscribed: nextSubscribed,
          pathname,
          surface: source,
          postId,
        });
        if (result.error) {
          setFollowing(previous.following);
          setSubscribed(previous.subscribed);
          setError(result.error);
          return;
        }

        setFollowing(result.following);
        setSubscribed(result.subscribed);
        trackActivationEvent({
          event: nextSubscribed
            ? "author_subscription_created"
            : "author_subscription_removed",
          source,
          metadata: { authorId, postId },
        });

        if (result.subscribed) {
          setToast(() => ({
            message: `Subscribed to ${authorName}. All work arrives in-app; email and push follow your settings.`,
            actionLabel: "Manage",
            onAction: () => {
              setToast(null);
              router.push("/settings?tab=notifications#publication-subscriptions");
            },
            durationMs: 7000,
          }));
        } else {
          setToast(() => ({
            message: `Unsubscribed from ${authorName}. You still follow this author.`,
            actionLabel: "Undo",
            onAction: () => {
              setToast(null);
              void runSubscriptionRef.current?.(
                true,
                "subscriptions_manager_undo"
              );
            },
            durationMs: 7000,
          }));
        }
        router.refresh();
      } catch {
        setFollowing(previous.following);
        setSubscribed(previous.subscribed);
        setError("Unable to update this subscription. Try again.");
      } finally {
        setPending(null);
      }
    },
    [
      authorId,
      authorName,
      currentUserId,
      following,
      pathname,
      pending,
      postId,
      requireLogin,
      router,
      subscribed,
    ]
  );
  useEffect(() => {
    runSubscriptionRef.current = runSubscription;
  }, [runSubscription]);

  const showSubscriptionNudge = useCallback(
    (
      source: "follow_nudge" | "qualified_read_nudge",
      force = false
    ) => {
      if (!currentUserId || subscribed || currentUserId === authorId) return;
      if (!force) {
        try {
          const nextEligibleAt = Number(
            window.localStorage.getItem(
              nudgeStorageKey(currentUserId, authorId)
            ) ?? 0
          );
          if (nextEligibleAt > Date.now()) return;
        } catch {
          // Continue with a session-only prompt.
        }
      }

      trackActivationEvent({
        event: "author_subscription_nudge_shown",
        source,
        metadata: { authorId, postId },
      });
      setToast(() => ({
        message:
          source === "follow_nudge"
            ? `Following ${authorName}. Subscribe to every new publication?`
            : `Enjoying ${authorName}'s work? Subscribe for every new publication.`,
        actionLabel: "Subscribe",
        onAction: () => {
          setToast(null);
          trackActivationEvent({
            event: "author_subscription_nudge_action",
            source,
            metadata: { authorId, action: "subscribe", postId },
          });
          void runSubscription(true, source);
        },
        onDismiss: () => {
          recordNudgeCooldown();
          trackActivationEvent({
            event: "author_subscription_nudge_action",
            source,
            metadata: { authorId, action: "dismiss", postId },
          });
        },
        durationMs: 8000,
      }));
    },
    [
      authorId,
      authorName,
      currentUserId,
      postId,
      recordNudgeCooldown,
      runSubscription,
      subscribed,
    ]
  );

  const runFollow = useCallback(
    async (nextFollowing: boolean, source: AuthorRelationshipSurface) => {
      if (!currentUserId) {
        requireLogin("follow", source);
        return;
      }
      if (pending) return;

      const previous = { following, subscribed };
      setFollowing(nextFollowing);
      if (!nextFollowing) setSubscribed(false);
      setPending("follow");
      setError(null);

      try {
        const result = await toggleFollow({
          followingId: authorId,
          follow: nextFollowing,
          pathname,
          surface: source,
          postId,
        });
        if (result.error) {
          setFollowing(previous.following);
          setSubscribed(previous.subscribed);
          setError(result.error);
          return;
        }
        setFollowing(result.following);
        setSubscribed(result.subscribed);
        if (nextFollowing && result.following) {
          trackActivationEvent({
            event: "writer_followed",
            source,
            metadata: { authorId, postId },
          });
          showSubscriptionNudge("follow_nudge", true);
        }
        router.refresh();
      } catch {
        setFollowing(previous.following);
        setSubscribed(previous.subscribed);
        setError("Unable to update this relationship. Try again.");
      } finally {
        setPending(null);
      }
    },
    [
      authorId,
      currentUserId,
      following,
      pathname,
      pending,
      postId,
      requireLogin,
      router,
      showSubscriptionNudge,
      subscribed,
    ]
  );

  const requestFollowChange = useCallback(
    (source: AuthorRelationshipSurface) => {
      if (!currentUserId) {
        requireLogin("follow", source);
        return;
      }
      if (following && subscribed) {
        setConfirmSource(source);
        return;
      }
      void runFollow(!following, source);
    },
    [currentUserId, following, requireLogin, runFollow, subscribed]
  );

  const requestSubscriptionChange = useCallback(
    (source: AuthorRelationshipSurface) => {
      void runSubscription(!subscribed, source);
    },
    [runSubscription, subscribed]
  );

  const offerQualifiedReadNudge = useCallback(() => {
    if (following && !subscribed) {
      showSubscriptionNudge("qualified_read_nudge");
    }
  }, [following, showSubscriptionNudge, subscribed]);

  useEffect(() => {
    if (!confirmSource) return;
    confirmButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmSource(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmSource]);

  useEffect(() => {
    if (!currentUserId || pending) return;
    const intent = readPendingIntent();
    if (!intent || intent.authorId !== authorId) return;
    setToast(() => ({
      message:
        intent.action === "subscribe"
          ? `Continue subscribing to ${authorName}?`
          : `Continue following ${authorName}?`,
      actionLabel: intent.action === "subscribe" ? "Subscribe" : "Follow",
      onAction: () => {
        setToast(null);
        if (intent.action === "subscribe") {
          void runSubscription(true, intent.source);
        } else {
          void runFollow(true, intent.source);
        }
      },
      durationMs: 10000,
    }));
  }, [
    authorId,
    authorName,
    currentUserId,
    pending,
    runFollow,
    runSubscription,
  ]);

  const value = useMemo<AuthorRelationshipContextValue>(
    () => ({
      authorId,
      authorName,
      currentUserId,
      following,
      subscribed,
      followCreated: false,
      subscriptionCreated: false,
      pending,
      error,
      requestFollowChange,
      requestSubscriptionChange,
      offerQualifiedReadNudge,
    }),
    [
      authorId,
      authorName,
      currentUserId,
      error,
      following,
      offerQualifiedReadNudge,
      pending,
      requestFollowChange,
      requestSubscriptionChange,
      subscribed,
    ]
  );

  return (
    <AuthorRelationshipContext.Provider value={value}>
      {children}
      {toast ? (
        <Toast
          message={toast.message}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
          durationMs={toast.durationMs}
          onDone={closeToast}
        />
      ) : null}
      {confirmSource ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setConfirmSource(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unfollow-author-title"
            aria-describedby="unfollow-author-description"
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
          >
            <h2
              id="unfollow-author-title"
              className="text-lg font-semibold text-gray-950"
            >
              Unfollow {authorName}?
            </h2>
            <p
              id="unfollow-author-description"
              className="mt-2 text-sm leading-6 text-gray-600"
            >
              This also stops publication updates from this author.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={() => setConfirmSource(null)}
                className="min-h-11 rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const source = confirmSource;
                  setConfirmSource(null);
                  void runFollow(false, source);
                }}
                className="min-h-11 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
              >
                Unfollow &amp; unsubscribe
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AuthorRelationshipContext.Provider>
  );
}

export function useAuthorRelationship() {
  const context = useContext(AuthorRelationshipContext);
  if (!context) {
    throw new Error(
      "useAuthorRelationship must be used within AuthorRelationshipProvider"
    );
  }
  return context;
}

export function useOptionalAuthorRelationship() {
  return useContext(AuthorRelationshipContext);
}
