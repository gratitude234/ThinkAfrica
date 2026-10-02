import Link from "next/link";
import FollowButton from "@/components/ui/FollowButton";
import UserAvatar from "@/components/ui/UserAvatar";
import type { ProfileRelatedThinker } from "@/lib/db/profilePage";
import { formatPublishedTopicLabel } from "@/lib/profileTopics";

function displayName(thinker: ProfileRelatedThinker) {
  return thinker.fullName?.trim() || `@${thinker.username}`;
}

function topicReason(thinker: ProfileRelatedThinker) {
  const labels = thinker.sharedTopics
    .slice(0, 2)
    .map((topic) => formatPublishedTopicLabel(topic));
  if (labels.length === 0) return null;
  return `Writes about ${labels.join(" · ")}`;
}

function networkReason(thinker: ProfileRelatedThinker) {
  if (thinker.ownerFollows && thinker.followsOwner) return "Mutual follow";
  if (thinker.ownerFollows || thinker.followsOwner) return "Follow connection";
  return null;
}

/**
 * Writers related to this profile through demonstrated publishing topics.
 * Follow relationships can strengthen the ordering and provide context, but
 * never create a recommendation on their own.
 */
export default function ProfileRelatedThinkers({
  thinkers,
  currentUserId,
}: {
  thinkers: ProfileRelatedThinker[];
  currentUserId: string | null;
}) {
  if (thinkers.length === 0) return null;

  return (
    <section className="profile-aside-section profile-related-thinkers" aria-labelledby="related-thinkers-heading">
      <h2 id="related-thinkers-heading">Related Thinkers</h2>
      <p className="profile-aside-note">
        Matched by published topics; follow relationships strengthen the connection.
      </p>
      <ul className="profile-related-thinker-list">
        {thinkers.map((thinker) => {
          const name = displayName(thinker);
          const topics = topicReason(thinker);
          const network = networkReason(thinker);

          return (
            <li key={thinker.id} className="profile-related-thinker">
              <div className="profile-related-thinker-head">
                <Link
                  href={`/${encodeURIComponent(thinker.username)}`}
                  className="focus-ring profile-related-thinker-identity"
                  aria-label={`View ${name}'s profile`}
                >
                  <UserAvatar
                    name={name}
                    src={thinker.avatarUrl}
                    size={40}
                    className="profile-related-thinker-avatar"
                  />
                  <span className="profile-related-thinker-name-wrap">
                    <strong>{name}</strong>
                    <span>@{thinker.username}</span>
                  </span>
                </Link>
                <FollowButton
                  followingId={thinker.id}
                  currentUserId={currentUserId}
                  initialFollowing={thinker.viewerFollows}
                  authorName={name}
                  source="author_card"
                  size="compact"
                />
              </div>

              {thinker.professionalTitle?.trim() ? (
                <p className="profile-related-thinker-title">
                  {thinker.professionalTitle.trim()}
                </p>
              ) : null}
              {topics ? <p className="profile-related-thinker-reason">{topics}</p> : null}
              {network ? (
                <p className="profile-related-thinker-network">{network}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
