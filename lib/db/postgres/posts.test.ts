import { describe, expect, it, vi } from "vitest";

import {
  POST_BY_SLUG_SQL,
  createPostgresPostsRepository,
  toPostRecord,
} from "@/lib/db/postgres/posts";
import { adaptDriver } from "@/lib/db/postgres/executor";
import { VISIBLE_POST_STATUSES, getPostAuthor } from "@/lib/db/types";

/**
 * The direct-SQL post lookup, held to the behaviour of the PostgREST query it
 * has to be swappable with. It cannot be run against a database in this phase,
 * so what is tested is everything that is not the connection: the statement's
 * shape, the parameters it sends, the row it produces, and the two failure
 * modes that would otherwise be discovered in production.
 */

function fakeExecutor(rows: Record<string, unknown>[]) {
  const calls: Array<{ text: string; params: readonly unknown[] }> = [];
  return {
    calls,
    executor: {
      async query<Row>(text: string, params: readonly unknown[] = []) {
        calls.push({ text, params });
        return rows as unknown as Row[];
      },
    },
  };
}

const fullRow = {
  id: "post-1",
  title: "A title",
  slug: "example-slug",
  content: "<p>body</p>",
  excerpt: "excerpt",
  type: "essay",
  content_kind: "article",
  article_format: "standard",
  tags: ["governance"],
  status: "published",
  author_id: "author-1",
  created_at: new Date("2026-09-01T10:00:00.000Z"),
  published_at: new Date("2026-09-02T10:00:00.000Z"),
  view_count: "12",
  impression_count: 40,
  read_count: null,
  cover_image_url: null,
  citation_id: "INDEGENIUS-1",
  published_version_id: "version-1",
  current_round: 2,
  revision_due_at: null,
  in_response_to: null,
  audio_summary_url: null,
  document_path: null,
  document_original_name: null,
  document_mime_type: null,
  document_size_bytes: "2048",
  profiles: {
    id: "author-1",
    username: "ada",
    full_name: "Ada",
    university: null,
    field_of_study: null,
    bio: null,
    avatar_url: null,
    verified: true,
    verified_type: "student",
  },
};

describe("POST_BY_SLUG_SQL", () => {
  it("passes the slug and the status list as parameters, never as text", () => {
    // The only defence against injection in a hand-written data layer is that
    // no value is ever part of the statement. Assert the statement is constant.
    expect(POST_BY_SLUG_SQL).toContain("p.slug = $1");
    expect(POST_BY_SLUG_SQL).not.toMatch(/\$\{/);
    expect(POST_BY_SLUG_SQL).not.toContain("'published'");
  });

  it("names one placeholder per status rather than passing an array", () => {
    // The obvious spelling, `p.status = any($2::text[])`, fails under
    // `fetch_types: false` -- the setting Cloudflare recommends for Hyperdrive
    // and the one lib/db/postgres/connection.ts uses. postgres.js then has no
    // type with which to serialise the array and sends
    // "published,pending,pending_revision,draft" as text, which Postgres
    // rejects as a malformed array literal. Every post page 500s, and no unit
    // test that builds its own driver can see it.
    const placeholders = VISIBLE_POST_STATUSES.map(
      (_status, index) => `$${index + 2}`
    ).join(", ");
    expect(POST_BY_SLUG_SQL).toContain(`p.status in (${placeholders})`);
    expect(POST_BY_SLUG_SQL).not.toContain("::text[]");
    expect(POST_BY_SLUG_SQL).not.toContain("any(");
  });

  it("outer-joins the author, matching the embedded PostgREST relationship", () => {
    // profiles!posts_author_id_fkey does not drop the post when the author row
    // is missing, so neither may this.
    expect(POST_BY_SLUG_SQL).toMatch(/left join public\.profiles as author/);
    expect(POST_BY_SLUG_SQL).not.toMatch(/\binner join\b/i);
  });

  it("asks for two rows so a duplicate slug is an error, not a coin toss", () => {
    expect(POST_BY_SLUG_SQL.trimEnd().endsWith("limit 2")).toBe(true);
  });

  it("selects no viewer-specific column, so the shared memo stays safe", () => {
    for (const forbidden of [
      "likes",
      "bookmarks",
      "follows",
      "author_subscriptions",
    ]) {
      expect(POST_BY_SLUG_SQL).not.toContain(forbidden);
    }
  });
});

describe("createPostgresPostsRepository", () => {
  it("sends the slug and the visible statuses", async () => {
    const { calls, executor } = fakeExecutor([fullRow]);
    await createPostgresPostsRepository(executor).findBySlug("example-slug");

    expect(calls).toHaveLength(1);
    expect(calls[0].text).toBe(POST_BY_SLUG_SQL);
    expect(calls[0].params).toEqual([
      "example-slug",
      "published",
      "pending",
      "pending_revision",
      "draft",
    ]);
    // Flat, all scalars. A nested array is precisely what a driver with no
    // type information cannot serialise.
    for (const param of calls[0].params) {
      expect(Array.isArray(param), JSON.stringify(param)).toBe(false);
    }
    expect(VISIBLE_POST_STATUSES).not.toContain("rejected");
  });

  it("returns null for a slug that resolves to nothing", async () => {
    const { executor } = fakeExecutor([]);
    await expect(
      createPostgresPostsRepository(executor).findBySlug("missing")
    ).resolves.toBeNull();
  });

  it("raises the same named failure the Supabase implementation raises", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const executor = {
      async query(): Promise<never[]> {
        throw new Error("canceling statement due to statement timeout");
      },
    };

    await expect(
      createPostgresPostsRepository(executor).findBySlug("example-slug")
    ).rejects.toThrow('Failed to load post "example-slug".');
    expect(error).toHaveBeenCalledWith(
      "[post/example-slug] core post query failed",
      expect.any(Error)
    );
    error.mockRestore();
  });

  it("refuses to serve an arbitrary post when a slug matches twice", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { executor } = fakeExecutor([fullRow, { ...fullRow, id: "post-2" }]);

    await expect(
      createPostgresPostsRepository(executor).findBySlug("example-slug")
    ).rejects.toThrow('Failed to load post "example-slug".');
    error.mockRestore();
  });
});

describe("toPostRecord", () => {
  it("gives callers the ISO strings PostgREST gave them, not Date objects", () => {
    const record = toPostRecord(fullRow);
    expect(record.created_at).toBe("2026-09-01T10:00:00.000Z");
    expect(record.published_at).toBe("2026-09-02T10:00:00.000Z");
    expect(record.revision_due_at).toBeNull();
  });

  it("numbers the counters a driver may hand back as strings", () => {
    const record = toPostRecord(fullRow);
    expect(record.view_count).toBe(12);
    expect(record.impression_count).toBe(40);
    expect(record.read_count).toBeNull();
    expect(record.document_size_bytes).toBe(2048);
  });

  it("produces an author the shared normaliser accepts", () => {
    expect(getPostAuthor(toPostRecord(fullRow))?.username).toBe("ada");
  });

  it("keeps a post whose author row is gone, with a null author", () => {
    const record = toPostRecord({ ...fullRow, profiles: null });
    expect(record.slug).toBe("example-slug");
    expect(getPostAuthor(record)).toBeNull();
  });
});

describe("adaptDriver", () => {
  it("passes values out of band to the driver's parameterised call", async () => {
    const seen: unknown[] = [];
    const driver = {
      async unsafe(text: string, params?: readonly unknown[]) {
        seen.push(text, params);
        return [{ id: "post-1" }];
      },
    };

    const rows = await adaptDriver(driver).query("select $1", ["value"]);
    expect(seen).toEqual(["select $1", ["value"]]);
    expect(rows).toEqual([{ id: "post-1" }]);
  });
});

describe("array columns", () => {
  it("selects tags as jsonb, which needs no type OID to parse", () => {
    // A bare `p.tags` comes back as the string "{governance,energy}" under
    // fetch_types: false, PostTags calls .map() on it, and the article body
    // silently fails to render inside its Suspense boundary. jsonb is a
    // built-in postgres.js parses without asking the server anything.
    expect(POST_BY_SLUG_SQL).toContain("to_jsonb(p.tags) as tags");
    expect(POST_BY_SLUG_SQL).not.toMatch(/^\s+p\.tags,$/m);
  });

  it("normalises tags whatever shape the driver produced", () => {
    // The second line of defence: a change to the driver options must not be
    // able to reintroduce the failure above.
    const tagsOf = (value: unknown) => toPostRecord({ ...fullRow, tags: value }).tags;

    expect(tagsOf(["energy", "nigeria"])).toEqual(["energy", "nigeria"]);
    expect(tagsOf(null)).toBeNull();
    expect(tagsOf("{energy,nigeria}")).toEqual(["energy", "nigeria"]);
    expect(tagsOf("{}")).toEqual([]);
    expect(tagsOf('{"climate change",energy}')).toEqual(["climate change", "energy"]);
  });

  it("never hands a caller something without .map()", () => {
    for (const value of [["a"], null, "{a,b}", "{}", "", 42, {}]) {
      const tags = toPostRecord({ ...fullRow, tags: value }).tags;
      expect(tags === null || Array.isArray(tags), JSON.stringify(value)).toBe(true);
    }
  });
});
