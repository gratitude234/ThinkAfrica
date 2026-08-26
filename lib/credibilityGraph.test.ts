import { describe, expect, it } from "vitest";
import {
  buildSignalId,
  CREDIBILITY_SIGNAL_COPY,
  CREDIBILITY_SIGNAL_KINDS,
  dedupeSignals,
  groupRecognitionSignals,
  isRecognitionSignal,
  RECOGNITION_SIGNAL_KINDS,
  REVIEW_KIND_COPY,
  sortSignalsByRecency,
  toPublicSignals,
  UNSUPPORTED_SIGNAL_KINDS,
  type CredibilitySignal,
} from "./credibilityGraph";

function signal(overrides: Partial<CredibilitySignal> = {}): CredibilitySignal {
  const kind = overrides.kind ?? "cited_by";
  return {
    id: buildSignalId(kind, "post_reference", overrides.sourceId ?? "edge-1"),
    kind,
    subjectProfileId: "author-1",
    sourceType: "post_reference",
    sourceId: "edge-1",
    occurredAt: "2026-08-01T00:00:00.000Z",
    ...CREDIBILITY_SIGNAL_COPY[kind],
    sourceUrl: "/post/citing-work",
    provenance: "derived_platform_record",
    visibility: "public",
    revokedAt: null,
    ...overrides,
  };
}

describe("credibility signal contract", () => {
  it("gives every signal kind controlled public copy", () => {
    for (const kind of CREDIBILITY_SIGNAL_KINDS) {
      const copy = CREDIBILITY_SIGNAL_COPY[kind];
      expect(copy.label.length).toBeGreaterThan(0);
      expect(copy.explanation.length).toBeGreaterThan(20);
    }
  });

  it("never claims a debate winner", () => {
    expect(CREDIBILITY_SIGNAL_KINDS).not.toContain("debate_winner");
    expect([...UNSUPPORTED_SIGNAL_KINDS]).toContain("debate_winner");
    // Participation and completion are the two facts the platform can prove.
    expect(CREDIBILITY_SIGNAL_KINDS).toContain("debate_participation");
    expect(CREDIBILITY_SIGNAL_KINDS).toContain("debate_completion");
  });

  it("uses no ranking or scoring language anywhere in its copy", () => {
    const forbidden = /\b(top|best|leading|expert|elite|rank|score|level|streak)\b/i;
    for (const kind of CREDIBILITY_SIGNAL_KINDS) {
      expect(CREDIBILITY_SIGNAL_COPY[kind].label).not.toMatch(forbidden);
      expect(CREDIBILITY_SIGNAL_COPY[kind].explanation).not.toMatch(forbidden);
    }
  });

  it("keeps peer review and editorial review distinct", () => {
    expect(REVIEW_KIND_COPY.peer_reviewed.label).toBe("Peer reviewed");
    expect(REVIEW_KIND_COPY.editorially_reviewed.label).toBe("Editorially reviewed");
    // Neither may be produced by moderation.
    for (const copy of Object.values(REVIEW_KIND_COPY)) {
      expect(copy.explanation).not.toMatch(/moderat/i);
    }
  });

  it("builds a stable id from kind, source type and source id", () => {
    expect(buildSignalId("cited_by", "post_reference", "edge-9")).toBe(
      "cited_by:post_reference:edge-9"
    );
  });
});

describe("public signal filtering", () => {
  it("drops revoked signals", () => {
    expect(
      toPublicSignals([signal({ revokedAt: "2026-08-05T00:00:00.000Z" })])
    ).toEqual([]);
  });

  it("drops private signals", () => {
    expect(toPublicSignals([signal({ visibility: "private" })])).toEqual([]);
  });

  it("drops signals with no inspectable source", () => {
    // An unverifiable claim on a public profile is the thing this system
    // exists to prevent.
    expect(toPublicSignals([signal({ sourceUrl: null })])).toEqual([]);
  });

  it("keeps a public, unrevoked, inspectable signal", () => {
    expect(toPublicSignals([signal()])).toHaveLength(1);
  });
});

describe("deduplication and ordering", () => {
  it("collapses the same fact arriving twice, keeping the earliest date", () => {
    const deduped = dedupeSignals([
      signal({ occurredAt: "2026-08-10T00:00:00.000Z" }),
      signal({ occurredAt: "2026-08-01T00:00:00.000Z" }),
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].occurredAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("keeps distinct sources apart", () => {
    expect(
      dedupeSignals([
        signal({ sourceId: "edge-1", id: buildSignalId("cited_by", "post_reference", "edge-1") }),
        signal({ sourceId: "edge-2", id: buildSignalId("cited_by", "post_reference", "edge-2") }),
      ])
    ).toHaveLength(2);
  });

  it("orders by recency, then deterministically by id", () => {
    const ordered = sortSignalsByRecency([
      signal({ id: "b", occurredAt: "2026-08-01T00:00:00.000Z" }),
      signal({ id: "a", occurredAt: "2026-08-01T00:00:00.000Z" }),
      signal({ id: "c", occurredAt: "2026-09-01T00:00:00.000Z" }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(["c", "a", "b"]);
  });
});

describe("recognition grouping", () => {
  it("treats authorship and responses as record, not recognition", () => {
    expect(isRecognitionSignal(signal({ kind: "authored" }))).toBe(false);
    expect(isRecognitionSignal(signal({ kind: "responded_to" }))).toBe(false);
    expect(isRecognitionSignal(signal({ kind: "cited_by" }))).toBe(true);
    expect(RECOGNITION_SIGNAL_KINDS).not.toContain("authored");
  });

  it("groups repeated signals into one entry with a count", () => {
    const groups = groupRecognitionSignals([
      signal({ id: "a", sourceId: "a" }),
      signal({ id: "b", sourceId: "b" }),
      signal({ id: "c", sourceId: "c" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("cited_by");
    expect(groups[0].count).toBe(3);
  });

  it("bounds the examples shown per group", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      signal({ id: `edge-${index}`, sourceId: `edge-${index}` })
    );
    const [group] = groupRecognitionSignals(many, 3);
    expect(group.count).toBe(9);
    expect(group.signals).toHaveLength(3);
  });

  it("excludes revoked and private signals from the counts", () => {
    const groups = groupRecognitionSignals([
      signal({ id: "a", sourceId: "a" }),
      signal({ id: "b", sourceId: "b", revokedAt: "2026-08-09T00:00:00.000Z" }),
      signal({ id: "c", sourceId: "c", visibility: "private" }),
    ]);
    expect(groups[0].count).toBe(1);
  });

  it("returns nothing when a profile has no recognition", () => {
    expect(groupRecognitionSignals([])).toEqual([]);
    expect(groupRecognitionSignals([signal({ kind: "authored" })])).toEqual([]);
  });

  it("orders groups by the fixed recognition order, not by count", () => {
    const groups = groupRecognitionSignals([
      signal({
        kind: "verified_external_recognition",
        id: "x",
        sourceId: "x",
        sourceType: "external_recognition",
        provenance: "verified_by_admin",
      }),
      signal({ id: "a", sourceId: "a" }),
    ]);
    // cited_by leads because the order is a product decision, not a ranking
    // of this author's signals against each other.
    expect(groups.map((group) => group.kind)).toEqual([
      "cited_by",
      "verified_external_recognition",
    ]);
  });
});
