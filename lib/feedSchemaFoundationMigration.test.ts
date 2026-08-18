import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260818000001_feed_schema_foundation.sql"
);
const sql = readFileSync(migrationPath, "utf8");

describe("feed schema foundation migration", () => {
  it("promotes the feed-critical topic projection through the normal ledger", () => {
    expect(migrationPath.replaceAll("\\", "/")).toContain("supabase/migrations/");
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS topic_keys text\[\] NOT NULL DEFAULT '\{\}'::text\[\]/i
    );
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.normalize_topic_key");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.derive_post_topic_keys");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.sync_post_topic_keys");
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF tags, topic_keys ON public\.posts/i);
    expect(sql).toContain("posts_published_topic_keys_idx");
  });

  it("backfills canonical keys behind a live sync trigger without rewriting edit time", () => {
    expect(sql).toContain("WITH normalized AS MATERIALIZED");
    expect(sql).toContain("public.derive_post_topic_keys(post.tags)");
    expect(sql).toContain("post.topic_keys IS DISTINCT FROM normalized.topic_keys");
    expect(sql).toContain("v_topic_keys text[] := NEW.topic_keys");
    expect(sql).toContain("NEW.topic_keys := OLD.topic_keys");
    expect(sql).toContain("NEW.topic_keys := v_topic_keys");
    expect(sql).not.toContain("DISABLE TRIGGER posts_touch_updated_at");
    expect(sql).not.toContain("to_jsonb(");
    expect(sql).not.toMatch(/UPDATE public\.posts(?: AS \w+)?\s+SET\s+status\b/i);
  });

  it("accepts only an exact canonical topic-key repair when tags are unchanged", () => {
    expect(sql).toContain("NEW.topic_keys @> v_derived_topic_keys");
    expect(sql).toContain("NEW.topic_keys <@ v_derived_topic_keys");
    expect(sql).toMatch(
      /NEW\.topic_keys @> v_derived_topic_keys[\s\S]+NEW\.topic_keys := v_derived_topic_keys[\s\S]+RETURN NEW;[\s\S]+NEW\.topic_keys := OLD\.topic_keys/i
    );
  });

  it("commits the brief schema phase before row backfill and concurrent indexes", () => {
    const beginCount = sql.match(/^BEGIN;$/gm)?.length ?? 0;
    const commitCount = sql.match(/^COMMIT;$/gm)?.length ?? 0;
    const touchFunction = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.touch_posts_updated_at()"
    );
    const alterPosts = sql.indexOf("ALTER TABLE public.posts");
    const firstCommit = sql.indexOf("COMMIT;");
    const backfill = sql.indexOf("WITH normalized AS MATERIALIZED");
    const firstConcurrentIndex = sql.indexOf("CREATE INDEX CONCURRENTLY");
    const lastCommitBeforeIndexes = sql.lastIndexOf(
      "COMMIT;",
      firstConcurrentIndex
    );

    expect(beginCount).toBe(3);
    expect(commitCount).toBe(3);
    expect(touchFunction).toBeGreaterThan(-1);
    expect(alterPosts).toBeGreaterThan(touchFunction);
    expect(sql.slice(alterPosts, firstCommit)).not.toContain(
      "CREATE OR REPLACE FUNCTION"
    );
    expect(firstCommit).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(firstCommit);
    expect(lastCommitBeforeIndexes).toBeGreaterThan(backfill);
    expect(firstConcurrentIndex).toBeGreaterThan(lastCommitBeforeIndexes);
    expect(sql.slice(firstConcurrentIndex)).not.toContain("BEGIN;");
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
    expect(sql).toContain("SET lock_timeout = '5s'");
    expect(sql).toContain("RESET lock_timeout");
  });

  it("removes only invalid allowlisted index shells before a concurrent retry", () => {
    expect(sql).toContain("AND NOT index_row.indisvalid");
    expect(sql).toContain("index_class.relname = ANY (ARRAY[");
    expect(sql).toContain("EXECUTE format('DROP INDEX public.%I', v_index_name)");
    expect(sql).not.toMatch(/DROP INDEX CONCURRENTLY/i);
  });

  it("adds partial indexes for stable public-feed and Response scans", () => {
    expect(sql).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_published_recency_id_idx[\s\S]+\(published_at DESC, id DESC\)[\s\S]+WHERE status = 'published'/i
    );
    expect(sql).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_published_kind_recency_id_idx[\s\S]+\(content_kind, published_at DESC, id DESC\)[\s\S]+WHERE status = 'published'/i
    );
    expect(sql).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_published_author_recency_id_idx[\s\S]+\(author_id, published_at DESC, id DESC\)[\s\S]+WHERE status = 'published'/i
    );
    expect(sql).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_published_response_parent_recency_id_idx[\s\S]+\(in_response_to, published_at DESC, id DESC\)[\s\S]+WHERE status = 'published'[\s\S]+in_response_to IS NOT NULL/i
    );
  });

  it("remains an additive expand migration", () => {
    expect(sql.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(sql.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true);
    expect(sql).not.toMatch(/DROP\s+(?:TABLE|COLUMN)\b/i);
    expect(sql).not.toContain("topic_subscriptions");
    expect(sql).not.toContain("publication_deliveries");
    expect(sql).not.toContain("notifications_type_check");
  });
});
