import type { PostCardData } from "./PostCard";
import HomeFeedCardImpression from "./HomeFeedCardImpression";
import type { HomeFeedTab } from "@/lib/homeFeedTabs";

interface PostFeedProps {
  posts: PostCardData[];
  surface: HomeFeedTab;
  currentUserId?: string | null;
  prioritizeFirstPost?: boolean;
}

/**
 * Home's list of publications. Every item is a Post or an Article card: no
 * people, topic or other modules are inserted between them (publishing reset,
 * Phase 2F). Writer and topic discovery live on Explore.
 */
export default function PostFeed({
  posts,
  surface,
  currentUserId = null,
  prioritizeFirstPost = true,
}: PostFeedProps) {
  return (
    <div>
      {posts.map((post, index) => (
        <div
          key={post.id}
          className="[contain-intrinsic-size:auto_520px] [content-visibility:auto]"
        >
          <HomeFeedCardImpression
            post={post}
            currentUserId={currentUserId}
            surface={surface}
            priority={prioritizeFirstPost && index === 0}
          />
        </div>
      ))}
    </div>
  );
}
