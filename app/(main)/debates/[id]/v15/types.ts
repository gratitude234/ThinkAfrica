export type DebateV15Stance = "for" | "against";

export type DebateV15Phase =
  | "recruiting"
  | "opening"
  | "rebuttal"
  | "voting"
  | "completed";

export type DebateV15Status = "open" | "active" | "closed" | "cancelled";

export interface DebateV15Profile {
  id: string;
  username: string | null;
  fullName: string | null;
  university: string | null;
  avatarUrl: string | null;
}

export interface DebateV15Slot {
  userId: string;
  stance: DebateV15Stance;
  status: "invited" | "accepted" | "declined";
  invitedAt: string;
  respondedAt: string | null;
  profile: DebateV15Profile | null;
}

export interface DebateV15Source {
  id: string;
  url: string;
  title: string | null;
}

export interface DebateV15Argument {
  id: string;
  authorId: string;
  stance: DebateV15Stance;
  phase: "opening" | "rebuttal";
  content: string;
  upvotes: number;
  createdAt: string;
  author: DebateV15Profile | null;
  sources: DebateV15Source[];
}

export interface DebateV15Related {
  id: string;
  title: string;
  forVotes: number;
  againstVotes: number;
}

export interface DebateV15RoomData {
  loadedAt: number;
  debate: {
    id: string;
    title: string;
    description: string | null;
    tags: string[];
    status: DebateV15Status;
    phase: DebateV15Phase;
    moderatorId: string | null;
    moderator: DebateV15Profile | null;
    recruitingDeadline: string | null;
    openingDeadline: string | null;
    rebuttalDeadline: string | null;
    votingDeadline: string | null;
    cancellationReason: string | null;
    cancelledAt: string | null;
    forVotes: number;
    againstVotes: number;
    recapStatus:
      | "none"
      | "pending"
      | "generating"
      | "ready"
      | "failed"
      | null;
    recapText: string | null;
    recapKeyDisagreement: string | null;
    recapAgreement: string | null;
    recapStrongestFor: string | null;
    recapStrongestAgainst: string | null;
    recapError: string | null;
  };
  currentUserId: string | null;
  isManager: boolean;
  slots: DebateV15Slot[];
  arguments: DebateV15Argument[];
  userUpvotedArgumentIds: string[];
  userFinalVote: DebateV15Stance | null;
  relatedDebates: DebateV15Related[];
}

export interface DebateV15ActionResult {
  ok: boolean;
  message?: string;
}
