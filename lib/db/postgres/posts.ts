import "server-only";

import {
  VISIBLE_POST_STATUSES,
  type AuthorProfile,
  type PostRecord,
  type PostsRepository,
} from "@/lib/db/types";
import type { SqlExecutor } from "@/lib/db/postgres/executor";

/**
 * The same lookup as lib/db/supabase/posts.ts, expressed as SQL.
 *
 * Written to be behaviourally identical to the PostgREST query rather than
 * merely similar, because the two have to be swappable mid-migration without
 * the route noticing:
 *
 *   - `profiles!posts_author_id_fkey (...)` is an outer join in PostgREST. A
 *     post whose author row is gone still returns, with a null author, so the
 *     join here is a LEFT JOIN and the author object is built conditionally.
 *   - `.maybeSingle()` is not "take the first row". It fails when the filter
 *     matches more than one. `posts.slug` is UNIQUE, so this asks for two rows
 *     and raises if two arrive, which keeps a broken constraint loud instead of
 *     silently serving an arbitrary post.
 *   - PostgREST serialises timestamps as strings. A driver hands back `Date`
 *     objects. `toTimestampString` reconciles that at the boundary so callers
 *     keep receiving what `PostRecord` promises.
 *
 * There is no authorization here. See the note on `PostsRepository.findBySlug`.
 */

/**
 * One placeholder per visible status, rather than one array parameter.
 *
 * The obvious spelling is `p.status = any($2::text[])` with the statuses
 * passed as a JS array. It works in a driver that knows the parameter's type,
 * and it fails in the configuration this application actually uses:
 * `fetch_types: false` (see lib/db/postgres/connection.ts) stops postgres.js
 * asking the server for type OIDs, so it has nothing to serialise an array
 * with and sends `published,pending,pending_revision,draft` as text. Postgres
 * then reports `malformed array literal`, and every post page 500s.
 *
 * Naming the placeholders removes the dependency on type inference entirely.
 * The list is derived from `VISIBLE_POST_STATUSES` so the SQL and the
 * parameters cannot disagree about how many there are.
 */
const STATUS_PLACEHOLDERS = VISIBLE_POST_STATUSES.map(
  (_status, index) => `$${index + 2}`
).join(", ");
export const POST_BY_SLUG_SQL = `
  select
    p.id,
    p.title,
    p.slug,
    p.content,
    p.excerpt,
    p.type,
    p.content_kind,
    p.article_format,
    to_jsonb(p.tags) as tags,
    p.status,
    p.author_id,
    p.created_at,
    p.published_at,
    p.view_count,
    p.impression_count,
    p.read_count,
    p.cover_image_url,
    p.citation_id,
    p.published_version_id,
    p.current_round,
    p.revision_due_at,
    p.in_response_to,
    p.audio_summary_url,
    p.document_path,
    p.document_original_name,
    p.document_mime_type,
    p.document_size_bytes,
    case
      when author.id is null then null
      else jsonb_build_object(
        'id', author.id,
        'username', author.username,
        'full_name', author.full_name,
        'university', author.university,
        'field_of_study', author.field_of_study,
        'bio', author.bio,
        'avatar_url', author.avatar_url,
        'verified', author.verified,
        'verified_type', author.verified_type
      )
    end as profiles
  from public.posts as p
  left join public.profiles as author on author.id = p.author_id
  where p.slug = $1
    and p.status in (${STATUS_PLACEHOLDERS})
  limit 2
`;

/** A driver may return a Date, a string, or null for a timestamptz. Callers
 *  were promised the string PostgREST gave them. */
function toTimestampString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  // int8 arrives as a string from most drivers, to avoid a lossy Number cast
  // the driver cannot know is safe. These columns are counters and fit.
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A `text[]` column, however the driver chose to hand it over.
 *
 * `fetch_types: false` (see lib/db/postgres/connection.ts) stops postgres.js
 * asking the server for type OIDs, and without them it cannot parse an array
 * result any more than it can serialise an array parameter. `posts.tags` then
 * arrives as the literal string `{governance,energy}`, `PostTags` calls
 * `.map()` on it, and the whole article body fails to render behind a Suspense
 * boundary: the page still returns 200, just three quarters empty.
 *
 * The query works around it by selecting `to_jsonb(p.tags)`, because jsonb is
 * a built-in type postgres.js parses without any OID lookup. This function is
 * the second line, so a future change to the driver options cannot silently
 * reintroduce the same failure: whatever arrives, callers get an array or null.
 */
function toStringArray(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "{}") return [];
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [trimmed];

  // A PostgreSQL array literal: braces, comma separated, quotes around any
  // element containing a comma, a brace, a quote or whitespace.
  const inner = trimmed.slice(1, -1);
  const items: string[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;

  for (const character of inner) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      items.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  items.push(current);

  return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

function toAuthor(value: unknown): AuthorProfile | null {
  if (!value || typeof value !== "object") return null;
  return value as AuthorProfile;
}

export function toPostRecord(row: Record<string, unknown>): PostRecord {
  return {
    id: String(row.id),
    title: (row.title as string | null) ?? null,
    slug: String(row.slug),
    content: (row.content as string | null) ?? null,
    excerpt: (row.excerpt as string | null) ?? null,
    type: String(row.type),
    content_kind: (row.content_kind as string | null) ?? null,
    article_format: (row.article_format as string | null) ?? null,
    tags: toStringArray(row.tags),
    status: String(row.status),
    author_id: String(row.author_id),
    // Not null in the schema, but the mapper must not invent a value if it
    // ever is: an empty string is a visible bug, `new Date()` is a silent one.
    created_at: toTimestampString(row.created_at) ?? "",
    published_at: toTimestampString(row.published_at),
    view_count: toNumber(row.view_count),
    impression_count: toNumber(row.impression_count),
    read_count: toNumber(row.read_count),
    cover_image_url: (row.cover_image_url as string | null) ?? null,
    citation_id: (row.citation_id as string | null) ?? null,
    published_version_id: (row.published_version_id as string | null) ?? null,
    current_round: toNumber(row.current_round),
    revision_due_at: toTimestampString(row.revision_due_at),
    in_response_to: (row.in_response_to as string | null) ?? null,
    audio_summary_url: (row.audio_summary_url as string | null) ?? null,
    document_path: (row.document_path as string | null) ?? null,
    document_original_name: (row.document_original_name as string | null) ?? null,
    document_mime_type: (row.document_mime_type as string | null) ?? null,
    document_size_bytes: toNumber(row.document_size_bytes),
    profiles: toAuthor(row.profiles),
  };
}

export function createPostgresPostsRepository(
  executor: SqlExecutor
): PostsRepository {
  return {
    async findBySlug(slug: string): Promise<PostRecord | null> {
      let rows: Record<string, unknown>[];
      try {
        // Flat, all scalars. A nested array here is the bug this shape exists
        // to prevent; see STATUS_PLACEHOLDERS.
        rows = await executor.query<Record<string, unknown>>(POST_BY_SLUG_SQL, [
          slug,
          ...VISIBLE_POST_STATUSES,
        ]);
      } catch (error) {
        // Same shape as the Supabase implementation, so a reader of the logs
        // does not have to know which adapter was live to search for it.
        console.error(`[post/${slug}] core post query failed`, error);
        throw new Error(`Failed to load post "${slug}".`);
      }

      if (rows.length > 1) {
        console.error(`[post/${slug}] core post query failed`, {
          message: `slug matched ${rows.length} rows`,
        });
        throw new Error(`Failed to load post "${slug}".`);
      }

      return rows.length === 0 ? null : toPostRecord(rows[0]);
    },
  };
}
