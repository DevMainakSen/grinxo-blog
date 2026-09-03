import { useCallback, useMemo, useState } from 'react';
import type { Blog } from '../types/blog';
import { toggleBookmark as apiToggleBookmark, toggleLike as apiToggleLike } from '../services/blogApi';
import { getClientId } from '../services/clientId';

export interface EngagementState {
  likeCount: number;
  bookmarkCount: number;
  liked: boolean;
  saved: boolean;
}

export interface EngagementActions {
  toggleLike: () => Promise<void>;
  toggleBookmark: () => Promise<void>;
}

/**
 * Local like/bookmark state for a single blog. Determines whether the current
 * client (via its persistent clientId) has liked/saved, and reflects the
 * server-aggregated counts. Optimistically updates the UI, then reconciles
 * with the server response.
 */
export function useEngagement(blog: Blog | undefined): [EngagementState, EngagementActions] {
  const clientId = useMemo(() => getClientId(), []);

  const [state, setState] = useState<EngagementState>(() => ({
    likeCount: blog?.likeCount ?? 0,
    bookmarkCount: blog?.bookmarkCount ?? 0,
    liked: Boolean(blog?.likedBy?.includes(clientId)),
    saved: Boolean(blog?.savedBy?.includes(clientId)),
  }));

  const toggleLike = useCallback(async () => {
    if (!blog) return;
    // Optimistic update.
    setState((prev) => ({
      ...prev,
      liked: !prev.liked,
      likeCount: Math.max(0, prev.likeCount + (prev.liked ? -1 : 1)),
    }));
    try {
      const updated = await apiToggleLike(blog.id, clientId);
      setState((prev) => ({
        likeCount: updated.likeCount ?? prev.likeCount,
        bookmarkCount: updated.bookmarkCount ?? prev.bookmarkCount,
        liked: Boolean(updated.likedBy?.includes(clientId)),
        saved: Boolean(updated.savedBy?.includes(clientId)),
      }));
    } catch {
      // Revert the optimistic change on failure.
      setState((prev) => ({
        ...prev,
        liked: !prev.liked,
        likeCount: Math.max(0, prev.likeCount + (prev.liked ? -1 : 1)),
      }));
    }
  }, [blog, clientId]);

  const toggleBookmark = useCallback(async () => {
    if (!blog) return;
    setState((prev) => ({ ...prev, saved: !prev.saved }));
    try {
      const updated = await apiToggleBookmark(blog.id, clientId);
      setState((prev) => ({
        likeCount: updated.likeCount ?? prev.likeCount,
        bookmarkCount: updated.bookmarkCount ?? prev.bookmarkCount,
        liked: Boolean(updated.likedBy?.includes(clientId)),
        saved: Boolean(updated.savedBy?.includes(clientId)),
      }));
    } catch {
      setState((prev) => ({ ...prev, saved: !prev.saved }));
    }
  }, [blog, clientId]);

  return [state, { toggleLike, toggleBookmark }];
}