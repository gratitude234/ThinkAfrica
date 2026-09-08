import "server-only";

/**
 * The member dashboard's reads, as PostgreSQL.
 *
 * Nineteen PostgREST calls, as ten business operations. Same production
 * database, not Neon; what changes is the transport.
 *
 * ## Which policies actually had to move
 *
 * Almost every query here is already scoped to the viewer's own id, and a
 * query filtering `author_id = <viewer>` or `user_id = <viewer>` satisfies its
 * table's policy by its own WHERE clause. Repeating the rule in those cases
 * would add nothing but a worse plan. The exceptions were found one at a time
 * by reading each policy rather than by assuming:
 *
 * - `bookmarks` is `USING (auth.uid() = user_id)`, for every command. The
 *   dashboard's bookmark stat has therefore only ever counted the viewer's own
 *   bookmarks of their own posts. See the note on `postStats`.
 * - `post_references` admits published posts, reviewers and co-authors, and
 *   *not* the author. See `postReferenceVisibleSql`.
 * - `posts` reached as an embed, where the status is unconstrained. A pending
 *   co-author invitation points at a draft, visible only because the invitee
 *   counts as a co-author.
 * - `profiles`, everywhere a name is shown.
 *
 * ## Two behaviours reproduced rather than repaired
 *
 * The bookmark stat above, and the fact that the fellowship and talent queries
 * run on every dashboard load even though `FEATURE_FLAGS.fellowshipsSection`
 * and `talentMarketplace` are both false and the sections render nothing.
 * Both are recorded as findings. A migration that quietly fixed either would
 * be changing the product inside a refactor.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { postReferenceVisibleSql, postVisibleSql } from "@/lib/db/postVisibility";
import { visibleProfileJoin } from "@/lib/db/profileVisibility";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface DashboardPostRow {
  id: string;
  author_id: string;
  title: string | null;
  slug: string;
  content: string | null;
  excerpt: string | null;
  tags: string[] | null;
  type: string;
  content_kind: string | null;
  article_format: string | null;
  status: string;
  impression_count: number | null;
  view_count: number | null;
  read_count: number | null;
  created_at: string;
  published_at: string | null;
  revision_due_at: string | null;
  citation_id: string | null;
  published_version_id: string | null;
  current_round: number | null;
  in_response_to: string | null;
  document_path: string | null;
  document_original_name: string | null;
  document_mime_type: string | null;
  document_size_bytes: number | null;
  post_reviews: Array<{
    // NOT NULL in the schema, with a default. Typed to match, because the
    // consumer treats it as always present and widening it here would move
    // the cast rather than remove it.
    assigned_at: string;
    submitted_at: string | null;
    recommendation: string | null;
  }>;
  post_editor_decisions: Array<{ decision: string; created_at: string }>;
  post_authors: Array<{
    user_id: string;
    accepted_at: string | null;
    profile: { username: string | null; full_name: string | null } | null;
  }>;
}


/** A named person, as every embed on this page projects them. */
export interface DashboardActor {
  full_name: string | null;
  username: string | null;
  avatar_url?: string | null;
}

export interface DashboardNotificationRow {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
  actor_id: string | null;
  post_id: string | null;
  message: string | null;
  link: string | null;
  actor: DashboardActor | DashboardActor[] | null;
  post: { title: string | null; slug: string } | Array<{ title: string | null; slug: string }> | null;
}

export interface DashboardInviteRow {
  post_id: string;
  invited_at: string | null;
  posts:
    | {
        id: string;
        title: string | null;
        slug: string;
        profiles: DashboardActor | DashboardActor[] | null;
      }
    | null;
}

export interface DashboardResponseRow {
  id: string;
  title: string | null;
  slug: string;
  in_response_to: string | null;
  published_at: string | null;
  profiles: DashboardActor | DashboardActor[] | null;
}

export interface DashboardLikeRow {
  created_at: string;
  posts:
    | { title: string | null; slug: string }
    | Array<{ title: string | null; slug: string }>
    | null;
}

export interface DashboardOwnResponseRow {
  created_at: string;
  title: string | null;
  slug: string;
}

export interface DashboardProofPost {
  id: string;
  title: string | null;
  slug: string;
  type: string;
  citation_id: string | null;
}

export interface DashboardApplicationRow {
  id: string;
  status: string;
  // NOT NULL with a default in the schema.
  applied_at: string;
  proof_post_id: string | null;
  review_note: string | null;
  fellowships:
    | {
        id: string;
        title: string;
        deadline: string | null;
        opportunity_type: string | null;
        application_url: string | null;
      }
    | Array<{
        id: string;
        title: string;
        deadline: string | null;
        opportunity_type: string | null;
        application_url: string | null;
      }>
    | null;
}

export interface DashboardOpportunityRow {
  id: string;
  title: string;
  sponsor_name: string | null;
  eligibility: string | null;
  deadline: string | null;
  opportunity_type: string | null;
  skills: string[] | null;
  location: string | null;
  featured: boolean | null;
}

export interface DashboardInquiryRow {
  id: string;
  organization_name: string | null;
  contact_email: string | null;
  opportunity_type: string | null;
  role_title: string | null;
  timeline: string | null;
  commitment: string | null;
  fit_reason: string | null;
  message: string | null;
  status: string;
  read_at: string | null;
  created_at: string;
}

/** The talent row, as the (currently hidden) opportunity panel reads it. */
export interface DashboardTalentProfile {
  id: string;
  open_to_opportunities: boolean;
  opportunity_types: string[] | null;
  cv_url: string | null;
  linkedin_url: string | null;
  skills: string[] | null;
  visibility: string;
}

export interface DashboardProfileRow {
  username: string | null;
  full_name: string | null;
  country: string | null;
  university: string | null;
  field_of_study: string | null;
  professional_title: string | null;
  bio: string | null;
  interests: string[] | null;
  verified: boolean | null;
  verified_type: string | null;
  profile_type: string | null;
}

export interface DashboardPostStats {
  referenceCounts: Record<string, number>;
  bookmarkCounts: Record<string, number>;
  responseCounts: Record<string, number>;
  likeCounts: Record<string, number>;
}

export interface DashboardRepository {
  /** Everything this member has written, newest first. */
  myPosts(viewerId: string): Promise<DashboardPostRow[]>;
  /**
   * The four per-post numbers the cards show, in one statement.
   *
   * Four PostgREST calls become one, and each keeps its own visibility rule:
   * they are four different tables with four different policies, not one
   * aggregate with a filter.
   */
  postStats(postIds: string[], viewerId: string): Promise<DashboardPostStats>;
  /** The member's own profile row, as the completion prompts read it. */
  myProfile(viewerId: string): Promise<DashboardProfileRow | null>;
  /** How many pieces of Featured Work exist. The recommender wants the fact,
   *  not the list. */
  featuredWorkCount(viewerId: string): Promise<number>;
  /** Unread notifications, with actor and post attached. */
  unreadNotifications(
    viewerId: string,
    limit: number
  ): Promise<DashboardNotificationRow[]>;
  /** Co-authorship invitations this member has not answered. */
  pendingInvites(
    viewerId: string,
    limit: number
  ): Promise<DashboardInviteRow[]>;
  /** Published responses other people wrote to this member's posts. */
  recentResponses(
    postIds: string[],
    viewerId: string,
    limit: number
  ): Promise<DashboardResponseRow[]>;
  /** Private engagement history: what this member liked, and replied to. */
  engagementHistory(
    viewerId: string,
    limit: number
  ): Promise<{
    likes: DashboardLikeRow[];
    responses: DashboardOwnResponseRow[];
  }>;
  /** Read cursors against last message, for the unread badge. */
  conversationReadState(viewerId: string): Promise<
    Array<{ last_read_at: string | null; last_message_at: string | null }>
  >;
  /** Everything the (currently hidden) opportunity surfaces ask for. */
  opportunityState(viewerId: string): Promise<{
    talentProfile: DashboardTalentProfile | null;
    inquiries: DashboardInquiryRow[];
    applications: DashboardApplicationRow[];
    proofPosts: DashboardProofPost[];
    savedOpportunities: Array<{ fellowship_id: string; created_at: string }>;
    openOpportunities: DashboardOpportunityRow[];
  }>;
  readonly backend: "supabase" | "postgres";
}

// ── SQL ──────────────────────────────────────────────────────────────

const MY_POSTS_SQL = `
  select
    p.id, p.author_id, p.title, p.slug, p.content, p.excerpt,
    to_jsonb(p.tags) as tags,
    p.type, p.content_kind, p.article_format, p.status,
    p.impression_count, p.view_count, p.read_count,
    p.created_at, p.published_at, p.revision_due_at,
    p.citation_id, p.published_version_id, p.current_round, p.in_response_to,
    p.document_path, p.document_original_name, p.document_mime_type,
    p.document_size_bytes,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'assigned_at', r.assigned_at,
        'submitted_at', r.submitted_at,
        'recommendation', r.recommendation
      ))
      from public.post_reviews r where r.post_id = p.id
    ), '[]'::jsonb) as post_reviews,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'decision', d.decision,
        'created_at', d.created_at
      ))
      from public.post_editor_decisions d where d.post_id = p.id
    ), '[]'::jsonb) as post_editor_decisions,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', a.user_id,
        'accepted_at', a.accepted_at,
        'profile', case when co.id is null then null else jsonb_build_object(
          'username', co.username,
          'full_name', co.full_name
        ) end
      ))
      from public.post_authors a
      ${visibleProfileJoin("co", "a.user_id", "$1")}
      where a.post_id = p.id
    ), '[]'::jsonb) as post_authors
  from public.posts p
  where p.author_id = $1::uuid
    and p.type <> $2::text
  order by p.created_at desc
`;

/**
 * Four counts, four different visibility rules, one round trip.
 *
 * Each branch keeps the rule its own table carries, which is why this is a
 * union of four scoped counts rather than one join. In particular the
 * bookmark branch is scoped to the viewer, because `bookmarks` is
 * `USING (auth.uid() = user_id)` and has always been.
 */
const POST_STATS_SQL = `
  with ids as (
    select (jsonb_array_elements_text($1::text::jsonb))::uuid as id
  )
  select
    'reference' as kind, r.post_id as post_id, count(*)::bigint as n
  from public.post_references r
  where r.post_id in (select id from ids)
    and ${postReferenceVisibleSql("r", "$2")}
  group by r.post_id

  union all
  select 'bookmark', b.post_id, count(*)::bigint
  from public.bookmarks b
  where b.post_id in (select id from ids)
    and b.user_id = $2::uuid
  group by b.post_id

  union all
  select 'response', p.in_response_to, count(*)::bigint
  from public.posts p
  where p.in_response_to in (select id from ids)
    and p.status = 'published'
  group by p.in_response_to

  union all
  select 'like', l.post_id, l.like_count::bigint
  from public.post_like_counts l
  where l.post_id in (select id from ids)
`;

const MY_PROFILE_SQL = `
  select
    p.username, p.full_name, p.country, p.university, p.field_of_study,
    p.professional_title, p.bio, to_jsonb(p.interests) as interests,
    p.verified, p.verified_type, p.profile_type
  from public.profiles p
  where p.id = $1::uuid
`;

const FEATURED_COUNT_SQL = `
  select count(*) as total
  from public.profile_featured_posts f
  where f.user_id = $1::uuid
`;

const NOTIFICATIONS_SQL = `
  select
    n.id, n.type, n.read, n.created_at, n.actor_id, n.post_id, n.message, n.link,
    case when actor.id is null then null else jsonb_build_object(
      'full_name', actor.full_name,
      'username', actor.username,
      'avatar_url', actor.avatar_url
    ) end as actor,
    case when np.id is null then null else jsonb_build_object(
      'title', np.title,
      'slug', np.slug
    ) end as post
  from public.notifications n
  ${visibleProfileJoin("actor", "n.actor_id", "$1")}
  left join public.posts np on np.id = n.post_id
  where n.user_id = $1::uuid
    and n.read = false
  order by n.created_at desc
  limit $2::int
`;

/**
 * The post on a pending invitation is normally a draft. It is visible because
 * the invitee counts as a co-author, which `postVisibleSql` reproduces, and
 * not because of anything about the post itself.
 */
const PENDING_INVITES_SQL = `
  select
    a.post_id,
    a.invited_at,
    case when p.id is null then null else jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'slug', p.slug,
      'profiles', case when author.id is null then null else jsonb_build_object(
        'full_name', author.full_name,
        'username', author.username
      ) end
    ) end as posts
  from public.post_authors a
  left join public.posts p
    on p.id = a.post_id
   and ${postVisibleSql("p", "$1")}
  ${visibleProfileJoin("author", "p.author_id", "$1")}
  where a.user_id = $1::uuid
    and a.accepted_at is null
  order by a.invited_at desc
  limit $2::int
`;

const RECENT_RESPONSES_SQL = `
  select
    p.id, p.title, p.slug, p.in_response_to, p.published_at,
    case when author.id is null then null else jsonb_build_object(
      'username', author.username,
      'full_name', author.full_name,
      'avatar_url', author.avatar_url
    ) end as profiles
  from public.posts p
  ${visibleProfileJoin("author", "p.author_id", "$2")}
  where p.status = 'published'
    and p.author_id <> $2::uuid
    and p.in_response_to in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
  order by p.published_at desc
  limit $3::int
`;

const MY_LIKES_SQL = `
  select
    l.created_at,
    case when p.id is null then null else jsonb_build_object(
      'title', p.title,
      'slug', p.slug
    ) end as posts
  from public.likes l
  left join public.posts p
    on p.id = l.post_id
   and ${postVisibleSql("p", "$1")}
  where l.user_id = $1::uuid
  order by l.created_at desc
  limit $2::int
`;

const MY_RESPONSES_SQL = `
  select p.created_at, p.title, p.slug
  from public.posts p
  where p.author_id = $1::uuid
    and p.in_response_to is not null
    and p.status = 'published'
  order by p.created_at desc
  limit $2::int
`;

/**
 * `conversations!inner` was an inner join, so a participant row whose
 * conversation is not readable drops out entirely. Reproduced as an inner
 * join for the same reason.
 */
const CONVERSATION_READ_SQL = `
  select cp.last_read_at, c.last_message_at
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  where cp.user_id = $1::uuid
`;

const TALENT_PROFILE_SQL = `
  select
    t.id, t.open_to_opportunities, to_jsonb(t.opportunity_types) as opportunity_types,
    t.cv_url, t.linkedin_url, to_jsonb(t.skills) as skills, t.visibility
  from public.talent_profiles t
  where t.user_id = $1::uuid
`;

const TALENT_INQUIRIES_SQL = `
  select
    i.id, i.organization_name, i.contact_email, i.opportunity_type,
    i.role_title, i.timeline, i.commitment, i.fit_reason, i.message,
    i.status, i.read_at, i.created_at
  from public.talent_inquiries i
  where i.talent_id = $1::uuid
    and i.status <> 'archived'
  order by i.created_at desc
  limit 5
`;

const APPLICATIONS_SQL = `
  select
    -- reviewed_at is deliberately absent: the column does not exist, in
    -- production or anywhere else. The PostgREST select named it anyway, so
    -- that request has always failed with a 400 and the caller discarded the
    -- error, which is why the applications list has silently been empty. A
    -- direct connection raises instead of returning nothing, so naming it
    -- here would turn a quiet blank into a broken page.
    a.id, a.status, a.applied_at, a.proof_post_id, a.review_note,
    case when f.id is null then null else jsonb_build_object(
      'id', f.id,
      'title', f.title,
      'deadline', f.deadline,
      'opportunity_type', f.opportunity_type,
      'application_url', f.application_url
    ) end as fellowships
  from public.fellowship_applications a
  left join public.fellowships f on f.id = a.fellowship_id
  where a.user_id = $1::uuid
  order by a.applied_at desc
`;

const PROOF_POSTS_SQL = `
  select p.id, p.title, p.slug, p.type, p.citation_id
  from public.posts p
  where p.id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
    and ${postVisibleSql("p", "$2")}
`;

const SAVED_OPPORTUNITIES_SQL = `
  select s.fellowship_id, s.created_at
  from public.saved_opportunities s
  where s.user_id = $1::uuid
  order by s.created_at desc
`;

const OPEN_OPPORTUNITIES_SQL = `
  select
    f.id, f.title, f.sponsor_name, f.eligibility, f.deadline,
    f.opportunity_type, to_jsonb(f.skills) as skills, f.location, f.featured
  from public.fellowships f
  where f.status = 'open'
  order by f.featured desc, f.deadline asc nulls last
  limit 12
`;

// ── Shared ───────────────────────────────────────────────────────────

function rows<T>(result: { data?: unknown; error?: unknown }, label: string): T[] {
  if (result.error) {
    const source = result.error as { message?: unknown };
    throw new Error(
      `${label}: ${typeof source.message === "string" ? source.message : "database error"}`
    );
  }
  return (result.data ?? []) as T[];
}

function tally(rowsIn: Array<{ post_id: string | null }>): Record<string, number> {
  return rowsIn.reduce<Record<string, number>>((acc, row) => {
    if (row.post_id) acc[row.post_id] = (acc[row.post_id] ?? 0) + 1;
    return acc;
  }, {});
}

const MY_POSTS_SELECT = `
      id, author_id, title, slug, content, excerpt, tags, type, content_kind, article_format, status, impression_count, view_count, read_count,
      created_at, published_at, revision_due_at, citation_id, published_version_id,
      current_round, in_response_to,
      document_path, document_original_name, document_mime_type, document_size_bytes,
      post_reviews(assigned_at, submitted_at, recommendation),
      post_editor_decisions(decision, created_at),
      post_authors(user_id, accepted_at, profile:profiles!post_authors_user_id_fkey(username, full_name))
      `;

// ── Supabase ─────────────────────────────────────────────────────────

export function createSupabaseDashboardRepository(
  supabase: SupabaseClient,
  researchTypeExclusion: string
): DashboardRepository {
  return {
    backend: "supabase",

    async myPosts(viewerId) {
      const result = await supabase
        .from("posts")
        .select(MY_POSTS_SELECT)
        .eq("author_id", viewerId)
        .neq("type", researchTypeExclusion)
        .order("created_at", { ascending: false });
      return rows<DashboardPostRow>(result, "dashboard posts");
    },

    async postStats(postIds) {
      if (postIds.length === 0) {
        return {
          referenceCounts: {},
          bookmarkCounts: {},
          responseCounts: {},
          likeCounts: {},
        };
      }

      const [references, bookmarks, responses, likeRows] = await Promise.all([
        supabase.from("post_references").select("post_id").in("post_id", postIds),
        supabase.from("bookmarks").select("post_id").in("post_id", postIds),
        supabase
          .from("posts")
          .select("in_response_to")
          .eq("status", "published")
          .in("in_response_to", postIds),
        supabase
          .from("post_like_counts")
          .select("post_id, like_count")
          .in("post_id", postIds),
      ]);

      return {
        referenceCounts: tally(rows(references, "reference counts")),
        bookmarkCounts: tally(rows(bookmarks, "bookmark counts")),
        responseCounts: tally(
          rows<{ in_response_to: string | null }>(responses, "response counts").map(
            (row) => ({ post_id: row.in_response_to })
          )
        ),
        likeCounts: rows<{ post_id: string; like_count: number | null }>(
          likeRows,
          "like counts"
        ).reduce<Record<string, number>>((acc, row) => {
          acc[row.post_id] = row.like_count ?? 0;
          return acc;
        }, {}),
      };
    },

    async myProfile(viewerId) {
      const result = await supabase
        .from("profiles")
        .select(
          "username, full_name, country, university, field_of_study, professional_title, bio, interests, verified, verified_type, profile_type"
        )
        .eq("id", viewerId)
        .single();
      // `single()` errors when nothing matched, which for the viewer's own
      // profile means the account is broken rather than absent. Kept as it was.
      if (result.error) return null;
      return result.data as unknown as DashboardProfileRow;
    },

    async featuredWorkCount(viewerId) {
      const result = await supabase
        .from("profile_featured_posts")
        .select("post_id", { count: "exact", head: true })
        .eq("user_id", viewerId);
      if (result.error) {
        throw new Error(`featured work count: ${result.error.message}`);
      }
      return result.count ?? 0;
    },

    async unreadNotifications(viewerId, limit) {
      const result = await supabase
        .from("notifications")
        .select(
          `id, type, read, created_at, actor_id, post_id, message, link,
           actor:profiles!notifications_actor_id_fkey(full_name, username, avatar_url),
           post:posts!notifications_post_id_fkey(title, slug)`
        )
        .eq("user_id", viewerId)
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(limit);
      return rows<DashboardNotificationRow>(result, "dashboard notifications");
    },

    async pendingInvites(viewerId, limit) {
      const result = await supabase
        .from("post_authors")
        .select(
          "post_id, invited_at, posts!post_authors_post_id_fkey(id, title, slug, profiles!posts_author_id_fkey(full_name, username))"
        )
        .eq("user_id", viewerId)
        .is("accepted_at", null)
        .order("invited_at", { ascending: false })
        .limit(limit);
      return rows<DashboardInviteRow>(result, "pending invites");
    },

    async recentResponses(postIds, viewerId, limit) {
      if (postIds.length === 0) return [];
      const result = await supabase
        .from("posts")
        .select(
          "id, title, slug, in_response_to, published_at, profiles!posts_author_id_fkey(username, full_name, avatar_url)"
        )
        .eq("status", "published")
        .neq("author_id", viewerId)
        .in("in_response_to", postIds)
        .order("published_at", { ascending: false })
        .limit(limit);
      return rows<DashboardResponseRow>(result, "recent responses");
    },

    async engagementHistory(viewerId, limit) {
      const [likes, responses] = await Promise.all([
        supabase
          .from("likes")
          .select("created_at, posts!likes_post_id_fkey(title, slug)")
          .eq("user_id", viewerId)
          .order("created_at", { ascending: false })
          .limit(limit),
        supabase
          .from("posts")
          .select("created_at, title, slug")
          .eq("author_id", viewerId)
          .not("in_response_to", "is", null)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);

      return {
        likes: rows<DashboardLikeRow>(likes, "engagement likes"),
        responses: rows<DashboardOwnResponseRow>(responses, "engagement responses"),
      };
    },

    async conversationReadState(viewerId) {
      const result = await supabase
        .from("conversation_participants")
        .select("last_read_at, conversations!inner(last_message_at)")
        .eq("user_id", viewerId);

      return rows<{
        last_read_at: string | null;
        conversations: { last_message_at: string | null } | Array<{ last_message_at: string | null }> | null;
      }>(result, "conversation read state").map((row) => {
        const conversation = Array.isArray(row.conversations)
          ? row.conversations[0]
          : row.conversations;
        return {
          last_read_at: row.last_read_at,
          last_message_at: conversation?.last_message_at ?? null,
        };
      });
    },

    async opportunityState(viewerId) {
      const [talent, applications, saved, open] = await Promise.all([
        supabase
          .from("talent_profiles")
          .select(
            "id, open_to_opportunities, opportunity_types, cv_url, linkedin_url, skills, visibility"
          )
          .eq("user_id", viewerId)
          .maybeSingle(),
        supabase
          .from("fellowship_applications")
          .select(
            "id, status, applied_at, proof_post_id, review_note, fellowships(id, title, deadline, opportunity_type, application_url)"
          )
          .eq("user_id", viewerId)
          .order("applied_at", { ascending: false }),
        supabase
          .from("saved_opportunities")
          .select("fellowship_id, created_at")
          .eq("user_id", viewerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("fellowships")
          .select(
            "id, title, sponsor_name, eligibility, deadline, opportunity_type, skills, location, featured"
          )
          .eq("status", "open")
          .order("featured", { ascending: false })
          .order("deadline", { ascending: true, nullsFirst: false })
          .limit(12),
      ]);

      const talentProfile = (talent.data ??
        null) as unknown as DashboardTalentProfile | null;
      const applicationRows = rows<DashboardApplicationRow>(applications, "fellowship applications");

      const proofIds = applicationRows
        .map((row) => row.proof_post_id)
        .filter((id): id is string => typeof id === "string");

      const [inquiries, proofPosts] = await Promise.all([
        talentProfile?.id
          ? supabase
              .from("talent_inquiries")
              .select(
                "id, organization_name, contact_email, opportunity_type, role_title, timeline, commitment, fit_reason, message, status, read_at, created_at"
              )
              .eq("talent_id", talentProfile.id)
              .neq("status", "archived")
              .order("created_at", { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [], error: null }),
        proofIds.length > 0
          ? supabase
              .from("posts")
              .select("id, title, slug, type, citation_id")
              .in("id", proofIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      return {
        talentProfile,
        inquiries: rows<DashboardInquiryRow>(inquiries, "talent inquiries"),
        applications: applicationRows,
        proofPosts: rows<DashboardProofPost>(proofPosts, "proof posts"),
        savedOpportunities: rows<{ fellowship_id: string; created_at: string }>(
          saved,
          "saved opportunities"
        ),
        openOpportunities: rows<DashboardOpportunityRow>(open, "open opportunities"),
      };
    },
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────

export function createPostgresDashboardRepository(
  executor: SqlExecutor,
  researchTypeExclusion: string
): DashboardRepository {
  return {
    backend: "postgres",

    async myPosts(viewerId) {
      return executor.query<DashboardPostRow>(MY_POSTS_SQL, [
        viewerId,
        researchTypeExclusion,
      ]);
    },

    async postStats(postIds, viewerId) {
      const empty = {
        referenceCounts: {},
        bookmarkCounts: {},
        responseCounts: {},
        likeCounts: {},
      };
      if (postIds.length === 0) return empty;

      const result = await executor.query<{
        kind: string;
        post_id: string | null;
        n: string | number;
      }>(POST_STATS_SQL, [JSON.stringify(postIds), viewerId]);

      const buckets: DashboardPostStats = {
        referenceCounts: {},
        bookmarkCounts: {},
        responseCounts: {},
        likeCounts: {},
      };
      const target: Record<string, Record<string, number>> = {
        reference: buckets.referenceCounts,
        bookmark: buckets.bookmarkCounts,
        response: buckets.responseCounts,
        like: buckets.likeCounts,
      };

      for (const row of result) {
        if (!row.post_id) continue;
        const bucket = target[row.kind];
        if (!bucket) continue;
        // count(*) is a bigint, which arrives as a string.
        bucket[row.post_id] = Number(row.n);
      }
      return buckets;
    },

    async myProfile(viewerId) {
      const [row] = await executor.query<DashboardProfileRow>(MY_PROFILE_SQL, [
        viewerId,
      ]);
      return row ?? null;
    },

    async featuredWorkCount(viewerId) {
      const [row] = await executor.query<{ total: string | number }>(
        FEATURED_COUNT_SQL,
        [viewerId]
      );
      return row ? Number(row.total) : 0;
    },

    async unreadNotifications(viewerId, limit) {
      return executor.query<DashboardNotificationRow>(NOTIFICATIONS_SQL, [
        viewerId,
        limit,
      ]);
    },

    async pendingInvites(viewerId, limit) {
      return executor.query<DashboardInviteRow>(PENDING_INVITES_SQL, [
        viewerId,
        limit,
      ]);
    },

    async recentResponses(postIds, viewerId, limit) {
      if (postIds.length === 0) return [];
      return executor.query<DashboardResponseRow>(RECENT_RESPONSES_SQL, [
        JSON.stringify(postIds),
        viewerId,
        limit,
      ]);
    },

    async engagementHistory(viewerId, limit) {
      const [likes, responses] = await Promise.all([
        executor.query<DashboardLikeRow>(MY_LIKES_SQL, [viewerId, limit]),
        executor.query<DashboardOwnResponseRow>(MY_RESPONSES_SQL, [viewerId, limit]),
      ]);
      return { likes, responses };
    },

    async conversationReadState(viewerId) {
      return executor.query<{
        last_read_at: string | null;
        last_message_at: string | null;
      }>(CONVERSATION_READ_SQL, [viewerId]);
    },

    async opportunityState(viewerId) {
      const [talentRows, applications, saved, open] = await Promise.all([
        executor.query<DashboardTalentProfile>(TALENT_PROFILE_SQL, [viewerId]),
        executor.query<DashboardApplicationRow>(APPLICATIONS_SQL, [viewerId]),
        executor.query<{ fellowship_id: string; created_at: string }>(
          SAVED_OPPORTUNITIES_SQL,
          [viewerId]
        ),
        executor.query<DashboardOpportunityRow>(OPEN_OPPORTUNITIES_SQL),
      ]);

      const talentProfile = talentRows[0] ?? null;
      const proofIds = applications
        .map((row) => row.proof_post_id)
        .filter((id): id is string => typeof id === "string");

      const [inquiries, proofPosts] = await Promise.all([
        talentProfile?.id
          ? executor.query<DashboardInquiryRow>(TALENT_INQUIRIES_SQL, [
              talentProfile.id,
            ])
          : Promise.resolve([] as DashboardInquiryRow[]),
        proofIds.length > 0
          ? executor.query<DashboardProofPost>(PROOF_POSTS_SQL, [
              JSON.stringify(proofIds),
              viewerId,
            ])
          : Promise.resolve([] as DashboardProofPost[]),
      ]);

      return {
        talentProfile,
        inquiries,
        applications,
        proofPosts,
        savedOpportunities: saved,
        openOpportunities: open,
      };
    },
  };
}
