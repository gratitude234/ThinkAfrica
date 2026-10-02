import FeedEngagementActions from "@/components/post/FeedEngagementActions";
import type { ProfilePublication } from "@/lib/profileViewData";

export default function ProfileWorkActions({
  work,
  currentUserId = null,
}: {
  work: ProfilePublication;
  currentUserId?: string | null;
}) {
  // An unavailable aggregate is unknown, and must never be presented as zero.
  if (!work.engagement) return null;
  return (
    <div className="profile-work-actions">
      <FeedEngagementActions
        postId={work.id}
        slug={work.slug}
        userId={currentUserId}
        initialLiked={work.engagement.viewerLiked}
        initialLikeCount={work.engagement.likeCount}
        initialBookmarked={work.engagement.viewerBookmarked}
        commentCount={work.engagement.commentCount}
        contentKind={work.kind}
        shareTitle={work.title || work.excerpt || undefined}
      />
    </div>
  );
}
