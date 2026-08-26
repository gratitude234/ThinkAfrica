import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countMissingFeatureNotes,
  FEATURE_NOTE_MAX_LENGTH,
  FEATURED_WORK_LIMIT,
  getFeatureNoteError,
  normalizeFeatureNote,
  validateFeaturedWorkSelections,
} from "./featuredWork";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260826000002_featured_work_notes.sql"
  ),
  "utf8"
);

describe("feature note normalization", () => {
  it("collapses whitespace and treats an empty note as absent", () => {
    expect(normalizeFeatureNote("  My best   work.  ")).toBe("My best work.");
    expect(normalizeFeatureNote("First line.\nSecond line.")).toBe(
      "First line. Second line."
    );
    expect(normalizeFeatureNote("   ")).toBeNull();
    expect(normalizeFeatureNote("")).toBeNull();
    expect(normalizeFeatureNote(null)).toBeNull();
    expect(normalizeFeatureNote(undefined)).toBeNull();
  });

  it("keeps punctuation and non-Latin text intact", () => {
    expect(normalizeFeatureNote("Vaccine access in Ìbàdàn: who pays?")).toBe(
      "Vaccine access in Ìbàdàn: who pays?"
    );
  });
});

describe("feature note validation", () => {
  it("accepts an empty note, because the explanation is optional", () => {
    expect(getFeatureNoteError("")).toBeNull();
    expect(getFeatureNoteError(null)).toBeNull();
  });

  it("accepts exactly the maximum and rejects one past it", () => {
    expect(getFeatureNoteError("a".repeat(FEATURE_NOTE_MAX_LENGTH))).toBeNull();
    expect(getFeatureNoteError("a".repeat(FEATURE_NOTE_MAX_LENGTH + 1))).toContain(
      String(FEATURE_NOTE_MAX_LENGTH)
    );
  });
});

describe("featured work selection validation", () => {
  it("returns ids and notes in the author's chosen order", () => {
    expect(
      validateFeaturedWorkSelections([
        { postId: "b", note: "Second thoughts." },
        { postId: "a", note: null },
      ])
    ).toEqual({
      postIds: ["b", "a"],
      notes: ["Second thoughts.", null],
      error: null,
    });
  });

  it("rejects a duplicate selection", () => {
    const result = validateFeaturedWorkSelections([
      { postId: "a", note: null },
      { postId: "a", note: "Again." },
    ]);
    expect(result.error).toMatch(/only once/i);
    expect(result.postIds).toEqual([]);
  });

  it("rejects more than the limit", () => {
    const result = validateFeaturedWorkSelections(
      Array.from({ length: FEATURED_WORK_LIMIT + 1 }, (_, index) => ({
        postId: `post-${index}`,
        note: null,
      }))
    );
    expect(result.error).toMatch(new RegExp(String(FEATURED_WORK_LIMIT)));
  });

  it("rejects a note past the maximum without partially saving", () => {
    const result = validateFeaturedWorkSelections([
      { postId: "a", note: "fine" },
      { postId: "b", note: "x".repeat(FEATURE_NOTE_MAX_LENGTH + 1) },
    ]);
    expect(result.error).toMatch(new RegExp(String(FEATURE_NOTE_MAX_LENGTH)));
    // Nothing is returned, so a caller cannot save the valid half.
    expect(result.postIds).toEqual([]);
    expect(result.notes).toEqual([]);
  });

  it("drops blank ids rather than sending them to the database", () => {
    expect(
      validateFeaturedWorkSelections([
        { postId: "  ", note: "orphan" },
        { postId: "a", note: null },
      ]).postIds
    ).toEqual(["a"]);
  });

  it("accepts an empty selection, which clears Featured Work", () => {
    expect(validateFeaturedWorkSelections([])).toEqual({
      postIds: [],
      notes: [],
      error: null,
    });
  });
});

describe("missing note count", () => {
  it("counts only selections with nothing written about them", () => {
    expect(
      countMissingFeatureNotes([
        { note: "Explained." },
        { note: null },
        { note: "   " },
      ])
    ).toBe(2);
    expect(countMissingFeatureNotes([])).toBe(0);
  });
});

describe("featured work notes migration", () => {
  it("adds a nullable column with the same maximum the UI enforces", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS feature_note text");
    expect(migration).toContain(
      `char_length(feature_note) <= ${FEATURE_NOTE_MAX_LENGTH}`
    );
    expect(migration).toContain("feature_note IS NULL");
    expect(migration).toContain("btrim(feature_note) <> ''");
  });

  it("ships a versioned RPC rather than changing the deployed one", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.replace_my_featured_posts_v2"
    );
    expect(migration).not.toContain("DROP FUNCTION public.replace_my_featured_posts");
  });

  it("keeps atomic replacement, ordering, and the eligibility rules", () => {
    expect(migration).toMatch(
      /DELETE FROM public\.profile_featured_posts[\s\S]*INSERT INTO public\.profile_featured_posts/
    );
    expect(migration).toContain("WITH ORDINALITY");
    expect(migration).toContain("post.status = 'published'");
    expect(migration).toContain("author.accepted_at IS NOT NULL");
    expect(migration).toContain("IF v_selected_count > 3");
    expect(migration).toContain("v_distinct_count <> v_selected_count");
  });

  it("stores a blank note as NULL so absent has one representation", () => {
    expect(migration).toContain("NULLIF(btrim(COALESCE(v_notes[selected.position], '')), '')");
  });

  it("grants execute to authenticated only", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.replace_my_featured_posts_v2(uuid[], text[])"
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.replace_my_featured_posts_v2\(uuid\[\], text\[\]\)\s*\n\s*TO authenticated;/
    );
  });
});
