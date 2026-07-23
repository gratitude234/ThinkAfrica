"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { togglePostLike } from "./likeActions";
import { toggleBookmark } from "./bookmarkActions";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";
import type { ContentKind } from "@/lib/contentModel";

interface PostEngagementState {
  liked: boolean | null;
  likeCount: number;
  likePending: boolean;
  likeError: string | null;
  bookmarked: boolean | null;
  bookmarkPending: boolean;
  bookmarkError: string | null;
  syncLiked: (value: boolean) => void;
  syncLikeCount: (value: number) => void;
  syncBookmarked: (value: boolean) => void;
  toggleLike: () => Promise<void>;
  toggleBookmark: () => Promise<void>;
}

const PostEngagementContext = createContext<PostEngagementState | null>(null);

interface PostEngagementProviderProps {
  postId: string;
  userId: string | null;
  contentKind?: ContentKind | null;
  children: React.ReactNode;
}

export function PostEngagementProvider({
  postId,
  userId,
  contentKind = null,
  children,
}: PostEngagementProviderProps) {
  const { requestAuth } = useGuestAuthGate();
  const [liked, setLiked] = useState<boolean | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [likePending, setLikePending] = useState(false);
  const [likeError, setLikeError] = useState<string | null>(null);

  const [bookmarked, setBookmarked] = useState<boolean | null>(null);
  const [bookmarkPending, setBookmarkPending] = useState(false);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);

  // Multiple Suspense-streamed leaves report the same server-fetched viewer
  // state on mount; only the first report should set it, so a later report
  // never clobbers a value the user has since toggled.
  const likeSynced = useRef(false);
  const likeCountSynced = useRef(false);
  const bookmarkSynced = useRef(false);

  const syncLiked = useCallback((value: boolean) => {
    if (likeSynced.current) return;
    likeSynced.current = true;
    setLiked(value);
  }, []);

  const syncLikeCount = useCallback((value: number) => {
    if (likeCountSynced.current) return;
    likeCountSynced.current = true;
    setLikeCount(value);
  }, []);

  const syncBookmarked = useCallback((value: boolean) => {
    if (bookmarkSynced.current) return;
    bookmarkSynced.current = true;
    setBookmarked(value);
  }, []);

  const toggleLike = useCallback(async () => {
    if (!userId) {
      requestAuth("like", { contentKind });
      return;
    }
    if (likePending) return;

    const wasLiked = liked ?? false;
    const prevCount = likeCount;

    setLiked(!wasLiked);
    setLikeCount(wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1);
    setLikePending(true);
    setLikeError(null);

    try {
      const result = await togglePostLike({ postId, nextLiked: !wasLiked });

      if (result.error) {
        setLiked(wasLiked);
        setLikeCount(prevCount);
        setLikeError(result.error);
      } else {
        setLiked(result.liked);
        setLikeCount(result.count);
      }
    } catch (error) {
      setLiked(wasLiked);
      setLikeCount(prevCount);
      setLikeError(error instanceof Error ? error.message : "Failed. Try again.");
    } finally {
      setLikePending(false);
    }
  }, [userId, requestAuth, contentKind, likePending, liked, likeCount, postId]);

  const toggleBookmarkAction = useCallback(async () => {
    if (!userId) {
      requestAuth("save", { contentKind });
      return;
    }
    if (bookmarkPending) return;

    const wasBookmarked = bookmarked ?? false;

    setBookmarked(!wasBookmarked);
    setBookmarkPending(true);
    setBookmarkError(null);

    try {
      const result = await toggleBookmark({ postId, nextBookmarked: !wasBookmarked });

      if (result.error) {
        setBookmarked(wasBookmarked);
        setBookmarkError(result.error);
      } else {
        setBookmarked(result.bookmarked);
      }
    } catch (error) {
      setBookmarked(wasBookmarked);
      setBookmarkError(error instanceof Error ? error.message : "Failed. Try again.");
    } finally {
      setBookmarkPending(false);
    }
  }, [userId, requestAuth, contentKind, bookmarkPending, bookmarked, postId]);

  const value = useMemo<PostEngagementState>(
    () => ({
      liked,
      likeCount,
      likePending,
      likeError,
      bookmarked,
      bookmarkPending,
      bookmarkError,
      syncLiked,
      syncLikeCount,
      syncBookmarked,
      toggleLike,
      toggleBookmark: toggleBookmarkAction,
    }),
    [
      liked,
      likeCount,
      likePending,
      likeError,
      bookmarked,
      bookmarkPending,
      bookmarkError,
      syncLiked,
      syncLikeCount,
      syncBookmarked,
      toggleLike,
      toggleBookmarkAction,
    ]
  );

  return (
    <PostEngagementContext.Provider value={value}>
      {children}
    </PostEngagementContext.Provider>
  );
}

export function usePostEngagement() {
  const context = useContext(PostEngagementContext);
  if (!context) {
    throw new Error("usePostEngagement must be used within a PostEngagementProvider");
  }
  return context;
}
