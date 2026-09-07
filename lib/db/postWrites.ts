import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PostStateSnapshot } from "@/lib/postPolicy";
import type { PostStatus } from "@/lib/types";
import type { SqlExecutor } from "@/lib/db/postgres/executor";

/**
 * The statements a post mutation issues, behind one interface.
 *
 * `lib/postMutations.ts` owns the pipeline and `lib/postPolicy.ts` owns the
 * decision. This owns neither: it is the four things the domain actually does
 * to a row, so the same policy can run against Supabase today and Neon later
 * without a second copy of anything that decides.
 *
 * The interface is deliberately narrow and deliberately not a query builder. A
 * repository that accepted arbitrary filters would let a caller write a
 * statement the policy never saw, which is the shape this whole layer exists
 * to remove. Every method takes the state it was authorized against and
 * returns how many rows it touched.
 */

export interface PostWriteExpectation {
  /** The status the policy authorized against. Repeated in the WHERE clause so
   *  a row that moved is missed rather than overwritten. */
  status: PostStatus;
  /** Set only for an author. An editor legitimately writes rows they do not
   *  own, and constraining them would turn every editorial decision into a
   *  conflict. */
  authorId: string | null;
}

export interface PostWriteRepository {
  /** The row as it is now, or null. Throws when the lookup itself failed: an
   *  unreachable database is not an absent post. */
  loadState(postId: string): Promise<PostStateSnapshot | null>;

  /** Returns the new id. */
  insert(values: Record<string, unknown>): Promise<string>;

  /** Returns rows affected. */
  updateOne(
    postId: string,
    patch: Record<string, unknown>,
    expect: PostWriteExpectation
  ): Promise<number>;

  /** Returns rows affected. */
  deleteOne(
    postId: string,
    expect: PostWriteExpectation
  ): Promise<number>;

  /** Clears `featured` everywhere. Returns rows affected. */
  clearFeatured(): Promise<number>;

  /**
   * Runs several dependent statements atomically.
   *
   * Supabase cannot: PostgREST has no transaction across requests, so its
   * implementation runs the callback against itself and the caller gets
   * ordering rather than atomicity. That is the behaviour production has today
   * and this does not pretend otherwise. The PostgreSQL implementation opens a
   * real transaction, so the same domain code becomes atomic when the adapter
   * changes, which is the point of putting the seam here.
   */
  transaction<T>(run: (repository: PostWriteRepository) => Promise<T>): Promise<T>;

  /** For diagnostics and tests. */
  readonly backend: "supabase" | "postgres";
}

// ── Which backend writes ─────────────────────────────────────────────

export type WriteAdapterName = "supabase" | "postgres";

/**
 * Separate from `DATABASE_ADAPTER` on purpose.
 *
 * Reads and writes carry different risk. A read served from the wrong database
 * shows stale content; a write sent to the wrong database is a row that exists
 * in one place and not the other, and no amount of switching back afterwards
 * repairs it. So the preview can read from Neon while still writing to
 * Supabase, and moving writes is a second, explicit decision with its own
 * rollback.
 *
 * Unset means Supabase, which is what production is. Anything unrecognised
 * throws rather than falling back, so a typo during a cutover cannot be
 * mistaken for a decision to stay.
 */
export function resolveWriteAdapter(
  raw: string | undefined = process.env.WRITE_DATABASE_ADAPTER
): WriteAdapterName {
  const value = (raw ?? "").trim();
  if (value === "" || value === "supabase") return "supabase";
  if (value === "postgres") return "postgres";
  throw new Error(
    `WRITE_DATABASE_ADAPTER must be "supabase" or "postgres". Received "${raw}".`
  );
}

// ── Supabase ─────────────────────────────────────────────────────────

const SNAPSHOT_COLUMNS =
  "id, author_id, status, type, content_kind, article_format, citation_id, published_version_id";

export function createSupabaseWriteRepository(
  supabase: SupabaseClient
): PostWriteRepository {
  const repository: PostWriteRepository = {
    backend: "supabase",

    async loadState(postId) {
      const { data, error } = await supabase
        .from("posts")
        .select(SNAPSHOT_COLUMNS)
        .eq("id", postId)
        .maybeSingle();

      if (error) {
        throw new Error(`post lookup failed: ${error.message.slice(0, 200)}`);
      }
      return (data as PostStateSnapshot | null) ?? null;
    },

    async insert(values) {
      const { data, error } = await supabase
        .from("posts")
        .insert(values)
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("insert returned no row");
      return (data as { id: string }).id;
    },

    async updateOne(postId, patch, expect) {
      let query = supabase
        .from("posts")
        .update(patch)
        .eq("id", postId)
        .eq("status", expect.status);

      if (expect.authorId) query = query.eq("author_id", expect.authorId);

      const { data, error } = await query.select("id");
      if (error) throw new Error(error.message);
      return (data ?? []).length;
    },

    async deleteOne(postId, expect) {
      let query = supabase.from("posts").delete().eq("id", postId);
      if (expect.authorId) {
        query = query.eq("author_id", expect.authorId).eq("status", expect.status);
      }

      const { data, error } = await query.select("id");
      if (error) throw new Error(error.message);
      return (data ?? []).length;
    },

    async clearFeatured() {
      const { data, error } = await supabase
        .from("posts")
        .update({ featured: false })
        .eq("featured", true)
        .select("id");

      if (error) throw new Error(error.message);
      return (data ?? []).length;
    },

    async transaction(run) {
      // Ordering, not atomicity. See the interface.
      return run(repository);
    },
  };

  return repository;
}

// ── PostgreSQL ───────────────────────────────────────────────────────

/**
 * How each writable column is sent.
 *
 * Not decoration. `postgres.js` runs with `fetch_types: false` (see
 * lib/db/postgres/connection.ts), so it has no type OIDs and cannot serialise
 * an array parameter: passing `["a","b"]` for a `text[]` column sends the
 * string `a,b` and Postgres rejects it as a malformed array literal. That
 * exact failure took every post page down in Phase 3, in the read direction.
 * This is the write direction of the same problem.
 *
 * So array columns are sent as jsonb and unpacked in SQL, and everything else
 * declares its cast explicitly rather than relying on inference the driver
 * cannot perform.
 */
type ColumnKind = "text" | "uuid" | "int" | "bool" | "timestamptz" | "text[]";

const COLUMN_KINDS: Record<string, ColumnKind> = {
  title: "text",
  slug: "text",
  content: "text",
  excerpt: "text",
  cover_image_url: "text",
  audio_summary_url: "text",
  document_path: "text",
  document_original_name: "text",
  document_mime_type: "text",
  type: "text",
  content_kind: "text",
  article_format: "text",
  status: "text",
  citation_id: "text",
  author_id: "uuid",
  in_response_to: "uuid",
  published_version_id: "uuid",
  current_round: "int",
  document_size_bytes: "int",
  featured: "bool",
  published_at: "timestamptz",
  revision_due_at: "timestamptz",
  tags: "text[]",
  research_keywords: "text[]",
};

/** The placeholder expression for one column, and the value to bind. */
function bind(
  column: string,
  value: unknown,
  index: number
): { expression: string; value: unknown } {
  const kind = COLUMN_KINDS[column];
  if (!kind) {
    // Unreachable through the domain, whose allowlists are the source of these
    // keys. Loud rather than silently dropped, because a column added to an
    // allowlist and not to this map would otherwise vanish from every write.
    throw new Error(`No write mapping for posts.${column}`);
  }

  const placeholder = `$${index}`;
  switch (kind) {
    case "text[]": {
      // jsonb in, text[] out. The one shape the driver can actually carry.
      //
      // The cast goes through `text` first, and that is not decoration.
      // Writing `$n::jsonb` makes postgres.js infer the jsonb type OID and
      // JSON-encode the parameter itself, so an already-serialised string
      // arrives double-encoded as `"[\"a\",\"b\"]"` and Postgres rejects it as
      // a scalar where an array was wanted. `$n::text::jsonb` sends the string
      // untouched and lets Postgres do the one conversion that was asked for.
      const json = `${placeholder}::text::jsonb`;
      return {
        expression:
          `CASE WHEN ${json} IS NULL THEN NULL ` +
          `ELSE ARRAY(SELECT jsonb_array_elements_text(${json})) END`,
        value: value === null || value === undefined ? null : JSON.stringify(value),
      };
    }
    case "int":
      return { expression: `${placeholder}::int`, value };
    case "bool":
      return { expression: `${placeholder}::boolean`, value };
    case "uuid":
      return { expression: `${placeholder}::uuid`, value };
    case "timestamptz":
      return { expression: `${placeholder}::timestamptz`, value };
    default:
      return { expression: `${placeholder}::text`, value };
  }
}

export function createPostgresWriteRepository(
  executor: SqlExecutor,
  runTransaction?: <T>(run: (executor: SqlExecutor) => Promise<T>) => Promise<T>
): PostWriteRepository {
  const repository: PostWriteRepository = {
    backend: "postgres",

    async loadState(postId) {
      const rows = await executor.query<Record<string, unknown>>(
        `select id, author_id, status, type, content_kind, article_format,
                citation_id, published_version_id
         from public.posts
         where id = $1::uuid
         limit 2`,
        [postId]
      );

      if (rows.length > 1) {
        throw new Error(`post lookup failed: id matched ${rows.length} rows`);
      }
      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        id: String(row.id),
        author_id: String(row.author_id),
        status: row.status as PostStatus,
        type: String(row.type),
        content_kind: (row.content_kind as string | null) ?? null,
        article_format: (row.article_format as string | null) ?? null,
        citation_id: (row.citation_id as string | null) ?? null,
        published_version_id: (row.published_version_id as string | null) ?? null,
      };
    },

    async insert(values) {
      const columns: string[] = [];
      const expressions: string[] = [];
      const params: unknown[] = [];

      for (const [column, value] of Object.entries(values)) {
        const bound = bind(column, value, params.length + 1);
        columns.push(`"${column}"`);
        expressions.push(bound.expression);
        params.push(bound.value);
      }

      if (columns.length === 0) throw new Error("insert with no columns");

      const rows = await executor.query<{ id: string }>(
        `insert into public.posts (${columns.join(", ")})
         values (${expressions.join(", ")})
         returning id`,
        params
      );

      if (rows.length !== 1) throw new Error("insert returned no row");
      return String(rows[0].id);
    },

    async updateOne(postId, patch, expect) {
      const assignments: string[] = [];
      const params: unknown[] = [];

      for (const [column, value] of Object.entries(patch)) {
        const bound = bind(column, value, params.length + 1);
        assignments.push(`"${column}" = ${bound.expression}`);
        params.push(bound.value);
      }

      if (assignments.length === 0) return 0;

      params.push(postId);
      const idPlaceholder = `$${params.length}`;
      params.push(expect.status);
      const statusPlaceholder = `$${params.length}`;

      let where = `id = ${idPlaceholder}::uuid and status = ${statusPlaceholder}::text`;
      if (expect.authorId) {
        params.push(expect.authorId);
        where += ` and author_id = $${params.length}::uuid`;
      }

      const rows = await executor.query<{ id: string }>(
        `update public.posts set ${assignments.join(", ")} where ${where} returning id`,
        params
      );
      return rows.length;
    },

    async deleteOne(postId, expect) {
      const params: unknown[] = [postId];
      let where = "id = $1::uuid";
      if (expect.authorId) {
        params.push(expect.authorId);
        where += ` and author_id = $${params.length}::uuid`;
        params.push(expect.status);
        where += ` and status = $${params.length}::text`;
      }

      const rows = await executor.query<{ id: string }>(
        `delete from public.posts where ${where} returning id`,
        params
      );
      return rows.length;
    },

    async clearFeatured() {
      const rows = await executor.query<{ id: string }>(
        `update public.posts set featured = false where featured = true returning id`
      );
      return rows.length;
    },

    async transaction(run) {
      if (!runTransaction) return run(repository);
      return runTransaction(async (tx) =>
        run(createPostgresWriteRepository(tx))
      );
    },
  };

  return repository;
}
