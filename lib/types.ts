export type VerificationType =
  | "student"
  | "researcher"
  | "faculty"
  | "institution";

export type AppRole = "student" | "reviewer" | "editor" | "admin";

/**
 * Every value `posts.status` can hold.
 *
 * A post the product creates is a draft or published, and nothing else. The
 * other four are legacy data: production still holds one `pending` row from
 * the retired editorial workflow, and `pending_revision`, `rejected` and
 * `withdrawn` remain reachable values of the column's own check constraint.
 * They are listed because the column can return them, not because anything
 * writes them. See lib/postPolicy.ts.
 */
export type PostStatus =
  | "draft"
  | "pending"
  | "pending_revision"
  | "published"
  | "rejected"
  | "removed"
  | "withdrawn";

export type ReferenceType = "journal" | "book" | "website" | "report" | "other";

export interface ProfileSummary {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  graduation_year?: number | null;
  avatar_url?: string | null;
  verified?: boolean;
  verified_type?: VerificationType | null;
  role?: AppRole;
  professional_title?: string | null;
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
