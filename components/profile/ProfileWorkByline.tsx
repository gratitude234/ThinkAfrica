import UserAvatar from "@/components/ui/UserAvatar";
import IdentityVerification from "./IdentityVerification";
import {
  getProfileDisplayName,
  type PublicProfileIdentity,
} from "@/lib/profileIdentity";

export default function ProfileWorkByline({
  author,
}: {
  author?: PublicProfileIdentity;
}) {
  if (!author) return null;
  return (
    <div className="profile-work-byline">
      <UserAvatar
        name={getProfileDisplayName(author)}
        src={author.avatar_url}
        size={26}
        className="rounded-full overflow-hidden shrink-0"
      />
      <span>{getProfileDisplayName(author)}</span>
      <IdentityVerification verified={author.verified} />
    </div>
  );
}
