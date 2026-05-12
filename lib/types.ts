import type { PostType } from "@/lib/utils";

export type VerificationType =
  | "student"
  | "researcher"
  | "faculty"
  | "institution";

export type AppRole = "student" | "reviewer" | "editor" | "admin";

export type PostStatus =
  | "draft"
  | "pending"
  | "pending_revision"
  | "published"
  | "rejected";

export type ReviewRecommendation = "accept" | "revise" | "reject";
export type EditorDecision = "accept" | "request_revision" | "reject";
export type PostVersionKind = "submission" | "revision" | "publication";

export type ReferenceType = "journal" | "book" | "website" | "report" | "other";

export interface ProfileSummary {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  graduation_year?: number | null;
  is_alumni?: boolean;
  avatar_url?: string | null;
  verified?: boolean;
  verified_type?: VerificationType | null;
  role?: AppRole;
}

export interface SubmissionTrack {
  post_type: PostType;
  requires_review: boolean;
  min_reviewers: number;
  allow_revision: boolean;
  description: string | null;
}

export interface PostReviewRecord {
  id: string;
  post_id: string;
  reviewer_id: string;
  round: number;
  recommendation: ReviewRecommendation | null;
  notes: string | null;
  submitted_at: string | null;
  assigned_at: string;
}

export interface PostVersionRecord {
  id: string;
  post_id: string;
  version_number: number;
  round: number;
  version_kind: PostVersionKind;
  content: string;
  title: string;
  excerpt: string | null;
  author_note: string | null;
  submitted_by: string | null;
  references: PostReferenceRecord[];
  authors: VersionAuthorRecord[];
  created_at: string;
  document_path?: string | null;
  document_original_name?: string | null;
  document_mime_type?: string | null;
  document_size_bytes?: number | null;
}

export interface PostAuthorRecord {
  post_id: string;
  user_id: string;
  display_order: number;
  corresponding_author: boolean;
  invited_at: string;
  accepted_at: string | null;
}

export interface AcceptedCoAuthor extends PostAuthorRecord {
  profile: ProfileSummary;
}

export interface VersionAuthorRecord {
  user_id: string;
  display_order: number;
  corresponding_author: boolean;
  accepted_at: string | null;
  profile: Pick<ProfileSummary, "username" | "full_name"> | null;
}

export interface PostReferenceRecord {
  id: string;
  post_id: string;
  display_order: number;
  ref_type: ReferenceType | null;
  authors: string | null;
  title: string;
  year: number | null;
  source: string | null;
  url: string | null;
  doi: string | null;
  raw: string | null;
}

export interface PostEditorDecisionRecord {
  id: string;
  post_id: string;
  round: number;
  editor_id: string;
  decision: EditorDecision;
  notes: string | null;
  created_at: string;
  editor?: Pick<ProfileSummary, "username" | "full_name"> | null;
}

export interface ExtendedPostRecord {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  content: string | null;
  excerpt: string | null;
  type: PostType;
  status: PostStatus;
  tags: string[] | null;
  view_count?: number | null;
  created_at: string;
  published_at: string | null;
  cover_image_url?: string | null;
  current_round: number;
  citation_id: string | null;
  revision_due_at: string | null;
  published_version_id?: string | null;
  in_response_to?: string | null;
  document_path?: string | null;
  document_original_name?: string | null;
  document_mime_type?: string | null;
  document_size_bytes?: number | null;
}

export interface PostContributorSummary extends ProfileSummary {
  corresponding_author?: boolean;
  display_order?: number;
}

export interface EditorialRoundSummary {
  round: number;
  version: PostVersionRecord | null;
  decision: PostEditorDecisionRecord | null;
  reviews: PostReviewRecord[];
}

export interface ResponsePostSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  published_at: string | null;
  author: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    verified?: boolean;
  };
}
