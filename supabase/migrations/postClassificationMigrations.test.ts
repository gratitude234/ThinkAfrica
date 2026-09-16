import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract checks on the three Phase 2I content-model migrations.
 *
 * There is no local migration runner, so a mistake here surfaces in production
 * or not at all. The expectations below are production's catalogue as read on
 * 2026-09-15: 311 posts in five classification combinations, five legacy
 * Research rows, four Policy Briefs, 77 rows carrying a genre, and two
 * publications carrying a citation_id.
 *
 * One convention this file leans on: statements a migration executes are
 * written in lowercase, and SQL inside a function body is uppercase. That is
 * how "does this file update posts" can be asked of a file whose whole purpose
 * is to define a function containing "UPDATE public.posts".
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

const NORMALIZE = "20260915000005_normalize_post_classification.sql";
const CANONICAL = "20260915000006_canonical_post_classification.sql";
const LOCKS = "20260915000007_retire_review_publication_locks.sql";
const PREVIOUS = "20260915000004_stop_gamification_and_publication_capture_triggers.sql";

function read(file: string) {
  return readFileSync(join(MIGRATIONS, file), "utf8").replace(/\r\n/g, "\n");
}

/** Statements only, so assertions are about what runs rather than what is explained. */
function executable(file: string) {
  return read(file)
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

const normalize = executable(NORMALIZE);
const canonical = executable(CANONICAL);
const locks = executable(LOCKS);

describe("the Phase 2I content-model migrations", () => {
  it("runs after the retired trigger stop, and in its own order", () => {
    expect(NORMALIZE > PREVIOUS).toBe(true);
    expect(CANONICAL > NORMALIZE).toBe(true);
    expect(LOCKS > CANONICAL).toBe(true);
  });

  it("is three single transactions", () => {
    for (const sql of [normalize, canonical, locks]) {
      expect(sql.trim().startsWith("begin;")).toBe(true);
      expect(sql.trim().endsWith("commit;")).toBe(true);
    }
  });

  it("drops no column, table, index or trigger anywhere", () => {
    for (const sql of [normalize, canonical, locks]) {
      expect(sql).not.toMatch(/\bdrop\s+(table|column|index|trigger|schema|view|type)\b/i);
      expect(sql).not.toMatch(/\b(delete\s+from\s+public\.posts|truncate)\b/i);
    }
    // Constraints are the one thing 000006 replaces, and only by name.
    expect(canonical).not.toMatch(/\bdrop\s+function\b/i);
  });
});

describe("20260915000005, normalizing the rows", () => {
  it("refuses a classification combination it was not written for, before touching anything", () => {
    const guard = normalize.slice(0, normalize.indexOf("create temporary table"));
    expect(guard).toContain("raise exception");
    expect(guard).toMatch(/Refusing to guess/);
    for (const combination of [
      "content_kind = 'post'     and type = 'blog'         and article_format is null",
      "content_kind = 'article'  and type = 'essay'        and article_format is null",
      "content_kind = 'article'  and type = 'essay'        and article_format = 'essay'",
      "content_kind = 'article'  and type = 'policy_brief' and article_format = 'policy_brief'",
      "content_kind = 'research' and type = 'research'     and article_format is null",
    ]) {
      expect(guard, combination).toContain(combination);
    }
    // A null content_kind must not slip through as an unknown NOT IN result.
    expect(guard).toContain("false)");
  });

  it("writes only the three classification columns", () => {
    const updates = [...normalize.matchAll(/^update public\.posts\n\s+set ([\s\S]*?)\n\s*where/gm)].map(
      (match) => match[1]
    );
    expect(updates).toHaveLength(3);

    const assigned = updates
      .join(",")
      .split(",")
      .map((clause) => clause.trim().split(/\s*=\s*/)[0].trim())
      .filter(Boolean);
    expect(new Set(assigned)).toEqual(new Set(["article_format", "type", "content_kind"]));
  });

  it("maps genre, policy briefs and research exactly as documented", () => {
    expect(normalize).toMatch(/set article_format = null\n\s*where article_format is not null;/);
    expect(normalize).toMatch(/set type = 'essay'\n\s*where type = 'policy_brief';/);
    expect(normalize).toMatch(
      /set type = 'essay',\n\s*content_kind = 'article'\n\s*where type = 'research'\n\s*or content_kind = 'research';/
    );
  });

  it("holds updated_at still, and re-enables both triggers before it commits", () => {
    expect(normalize).toContain("alter table public.posts disable trigger posts_touch_updated_at;");
    expect(normalize).toContain("alter table public.posts disable trigger posts_sync_content_classification;");
    expect(normalize).toContain("alter table public.posts enable trigger posts_touch_updated_at;");
    expect(normalize).toContain("alter table public.posts enable trigger posts_sync_content_classification;");

    // Re-enabled after the last update, and before the verification block.
    const lastUpdate = normalize.lastIndexOf("update public.posts");
    const enable = normalize.indexOf("enable trigger posts_touch_updated_at");
    expect(enable).toBeGreaterThan(lastUpdate);
    expect(enable).toBeLessThan(normalize.lastIndexOf("commit;"));
  });

  it("proves no other column and no other row moved, by hash, before committing", () => {
    // updated_at must be inside the hash: a normalization is not an edit.
    expect(normalize).toContain("to_jsonb(p) - 'type' - 'content_kind' - 'article_format'");
    expect(normalize).not.toContain("- 'updated_at'");

    const verification = normalize.slice(normalize.lastIndexOf("enable trigger posts_touch_updated_at"));
    expect(verification).toContain("row_hash");
    expect(verification).toMatch(/raise exception[\s\S]*?was added or removed/);
    expect(verification).toMatch(/a status moved/);
    expect(verification).toMatch(/Article count is/);
  });

  it("keeps the statuses, the rows and the ownership out of its reach", () => {
    expect(normalize).not.toMatch(/set[\s\S]{0,40}\bstatus\s*=/);
    expect(normalize).not.toMatch(/set[\s\S]{0,40}\bauthor_id\s*=/);
    expect(normalize).not.toMatch(/set[\s\S]{0,40}\bslug\s*=/);
    expect(normalize).not.toMatch(/set[\s\S]{0,40}\btitle\s*=/);
    expect(normalize).not.toMatch(/set[\s\S]{0,40}\bcontent\s*=/);
    expect(normalize).not.toMatch(/set[\s\S]{0,40}\bpublished_at\s*=/);
  });
});

describe("20260915000006, the canonical contract", () => {
  it("refuses to run before the rows are normalized", () => {
    const guard = canonical.slice(0, canonical.indexOf("create or replace function"));
    expect(guard).toContain("Apply 20260915000005 first");
    expect(guard).toContain("raise exception");
  });

  it("makes content_kind the classification, not null and two-valued", () => {
    expect(canonical).toContain("alter column content_kind set not null");
    expect(canonical).toMatch(/add constraint posts_content_kind_check\n\s*check \(content_kind in \('post', 'article'\)\)/);
  });

  it("makes genre unreachable rather than restricted", () => {
    expect(canonical).toMatch(/add constraint posts_article_format_check\n\s*check \(article_format is null\)/);
    expect(canonical).toContain("drop constraint if exists posts_article_format_requires_article_check");
  });

  it("admits neither research nor policy_brief in any constraint it adds", () => {
    const added = [...canonical.matchAll(/add constraint \w+\n\s*check \(([\s\S]*?)\);/g)].map((m) => m[1]);
    expect(added.length).toBeGreaterThanOrEqual(5);
    for (const definition of added) {
      expect(definition).not.toContain("research");
      expect(definition).not.toContain("policy_brief");
    }
  });

  it("states the product rule once, keyed on content_kind alone", () => {
    expect(canonical).toMatch(
      /add constraint posts_title_required_unless_post_check\n\s*check \(content_kind = 'post' or \(title is not null and btrim\(title\) <> ''\)\)/
    );
    // The old form resolved the kind through the legacy column.
    expect(canonical).not.toContain("effective_content_kind(type, content_kind) IN ('post', 'article')");
  });

  it("derives the legacy type from content_kind, and marks it for removal", () => {
    const fn = canonical.slice(
      canonical.indexOf("create or replace function public.sync_post_content_classification"),
      canonical.indexOf("comment on function public.sync_post_content_classification")
    );
    expect(fn).toContain("NEW.type := CASE NEW.content_kind WHEN 'post' THEN 'blog' ELSE 'essay' END;");
    expect(fn).toContain("NEW.article_format := NULL;");
    // content_kind decides type, never the other way round.
    expect(fn).not.toMatch(/NEW\.content_kind := CASE NEW\.type\b/);

    // Both derivations carry the removal marker Phase 2J greps for. It lives in
    // a comment, so it is asserted against the file rather than against the
    // statements-only projection the rest of this suite reads.
    const raw = read(CANONICAL);
    expect(raw).toMatch(
      /LEGACY DB COMPATIBILITY -- REMOVE IN PHASE 2J[\s\S]*?NEW\.type := CASE NEW\.content_kind/
    );
    expect(raw).toMatch(
      /LEGACY DB COMPATIBILITY -- REMOVE IN PHASE 2J[\s\S]*?NEW\.article_format := NULL;/
    );
  });

  it("still gives a caller that sends neither column a valid classification", () => {
    const fn = canonical.slice(canonical.indexOf("create or replace function public.sync_post_content_classification"));
    expect(fn).toContain("IF NEW.content_kind IS NULL THEN");
    expect(fn).toContain("WHEN NEW.type = 'blog' THEN 'post'");
    expect(fn).toContain("WHEN NULLIF(btrim(NEW.title), '') IS NULL THEN 'post'");
  });

  it("verifies the contract is in force before it commits", () => {
    const verification = canonical.slice(canonical.lastIndexOf("do $$"));
    expect(verification).toContain("convalidated");
    expect(verification).toContain("posts_sync_content_classification");
    expect(verification).toMatch(/would have no value to satisfy NOT NULL/);
  });
});

describe("20260915000007, retiring the review locks", () => {
  it("refuses to run before the contract exists", () => {
    const guard = locks.slice(0, locks.indexOf("create or replace function"));
    expect(guard).toContain("Apply 20260915000006 before 20260915000007");
  });

  it("redefines the three functions and changes no row", () => {
    for (const fn of [
      "public.guard_locked_post_write()",
      "public.is_post_editable(target_post_id uuid)",
      "public.apply_post_edit_draft(target_draft_id uuid)",
    ]) {
      expect(locks, fn).toContain(`create or replace function ${fn}`);
    }
    // Lowercase statements are what this file executes; the uppercase SQL is
    // inside apply_post_edit_draft's body.
    expect(locks).not.toMatch(/^update /m);
    expect(locks).not.toMatch(/^insert /m);
    expect(locks).not.toMatch(/^delete /m);
    expect(locks).not.toMatch(/\balter table\b/i);
  });

  it("stops writing the column production does not have", () => {
    expect(locks).not.toContain("editorial_updated_at = now()");
    const verification = locks.slice(locks.lastIndexOf("do $$"));
    expect(verification).toContain("editorial_updated_at");
    expect(verification).toContain("raise exception");
  });

  it("removes every review-era lock from the guard", () => {
    const guard = locks.slice(
      locks.indexOf("create or replace function public.guard_locked_post_write()"),
      locks.indexOf("comment on function public.guard_locked_post_write()")
    );
    expect(guard).not.toContain("'research'");
    expect(guard).not.toContain("'policy_brief'");
    expect(guard).not.toContain("locked after acceptance");
  });

  it("keeps the rules that are not about review", () => {
    const guard = locks.slice(
      locks.indexOf("create or replace function public.guard_locked_post_write()"),
      locks.indexOf("comment on function public.guard_locked_post_write()")
    );
    expect(guard).toContain("IF OLD.status != 'draft' THEN");
    expect(guard).toContain("NEW.citation_id IS DISTINCT FROM OLD.citation_id");
    expect(guard).toContain("NEW.published_version_id IS DISTINCT FROM OLD.published_version_id");
    expect(guard).toContain("NEW.status = 'removed'");
    expect(guard).toContain("OLD.status = 'withdrawn'");
    // The bypass apply_post_edit_draft depends on.
    expect(guard).toContain("current_user IS DISTINCT FROM 'authenticated'");
  });

  it("unlocks a formerly reviewed publication's body and its sources", () => {
    const editable = locks.slice(
      locks.indexOf("create or replace function public.is_post_editable"),
      locks.indexOf("comment on function public.is_post_editable")
    );
    expect(editable).toContain("status = 'removed' OR status = 'withdrawn'");
    expect(editable).not.toContain("type IN");

    const apply = locks.slice(locks.indexOf("create or replace function public.apply_post_edit_draft"));
    expect(apply).not.toContain("Reviewed publications are locked after acceptance.");
    expect(apply).not.toContain("effective_content_kind");
  });

  it("writes content_kind alone, and lets the trigger derive the rest", () => {
    const apply = locks.slice(locks.indexOf("create or replace function public.apply_post_edit_draft"));
    const update = apply.slice(apply.indexOf("UPDATE public.posts"), apply.indexOf("WHERE id = post_row.id;"));
    expect(update).toContain("content_kind = CASE WHEN normalized_title IS NULL THEN 'post' ELSE 'article' END");
    expect(update).not.toMatch(/\btype = CASE\b/);
    expect(update).not.toContain("article_format");
  });

  it("keeps the reference identity the published body anchors to", () => {
    // The same rule 20260823000001 established: re-minting ids breaks every
    // inline citation in the post.
    expect(locks).not.toMatch(/DELETE FROM public\.post_references\s+WHERE post_id = post_row\.id;/);
    expect(locks).toMatch(/DELETE FROM public\.post_references ref[\s\S]*?NOT EXISTS/);
    expect(locks).toContain("IF FOUND THEN");
  });
});
