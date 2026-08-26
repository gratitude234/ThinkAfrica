import { describe, expect, it } from "vitest";
import {
  buildExpertiseSummary,
  buildTopicEvidence,
  EXPERTISE_MIN_CONTRIBUTIONS,
  qualifiesAsDemonstratedExpertise,
  rankDemonstratedExpertise,
  selectRepresentativeWorks,
  type TopicEvidence,
} from "./demonstratedExpertise";

function evidence(overrides: Partial<TopicEvidence> = {}): TopicEvidence {
  return {
    key: "public health",
    label: "Public health",
    contributionCount: 1,
    sourceBackedCount: 0,
    citableCount: 0,
    inboundCitationCount: 0,
    reviewedCount: 0,
    coAuthoredCount: 0,
    debateContributionCount: 0,
    lastContributionAt: "2026-08-01T00:00:00.000Z",
    representativeWorks: [],
    ...overrides,
  };
}

describe("expertise qualification", () => {
  it("qualifies on two contributions", () => {
    expect(
      qualifiesAsDemonstratedExpertise(
        evidence({ contributionCount: EXPERTISE_MIN_CONTRIBUTIONS })
      )
    ).toBe(true);
  });

  it("does not qualify on one ordinary contribution", () => {
    expect(qualifiesAsDemonstratedExpertise(evidence({ contributionCount: 1 }))).toBe(
      false
    );
  });

  it("qualifies on one contribution carrying a stronger signal", () => {
    for (const stronger of [
      { reviewedCount: 1 },
      { inboundCitationCount: 1 },
      { citableCount: 1 },
    ]) {
      expect(
        qualifiesAsDemonstratedExpertise(
          evidence({ contributionCount: 1, ...stronger })
        )
      ).toBe(true);
    }
  });

  it("never qualifies with no contributions, however much else is present", () => {
    expect(
      qualifiesAsDemonstratedExpertise(
        evidence({
          contributionCount: 0,
          reviewedCount: 3,
          inboundCitationCount: 5,
          debateContributionCount: 4,
        })
      )
    ).toBe(false);
  });

  it("does not let debate contributions alone qualify a topic", () => {
    expect(
      qualifiesAsDemonstratedExpertise(
        evidence({ contributionCount: 0, debateContributionCount: 6 })
      )
    ).toBe(false);
  });
});

describe("expertise summary grammar", () => {
  it("states the count and topic with no adjective", () => {
    expect(buildExpertiseSummary(evidence({ contributionCount: 6 }))).toBe(
      "6 contributions on Public health."
    );
  });

  it("leads with the strongest evidence and caps the clauses at two", () => {
    expect(
      buildExpertiseSummary(
        evidence({
          contributionCount: 6,
          reviewedCount: 1,
          inboundCitationCount: 2,
          sourceBackedCount: 4,
          citableCount: 1,
          coAuthoredCount: 2,
        })
      )
    ).toBe(
      "6 contributions on Public health, including 1 reviewed contribution and 2 inbound citations from other publications."
    );
  });

  it("uses singular and plural correctly", () => {
    expect(
      buildExpertiseSummary(
        evidence({ contributionCount: 1, citableCount: 1, label: "Education policy" })
      )
    ).toBe("1 contribution on Education policy, including 1 citable record.");
  });

  it("describes debate contributions when they are the supporting evidence", () => {
    expect(
      buildExpertiseSummary(
        evidence({
          contributionCount: 3,
          debateContributionCount: 2,
          label: "Education policy",
        })
      )
    ).toBe(
      "3 contributions on Education policy, including 2 structured debate contributions."
    );
  });

  it("never produces an unsupported claim", () => {
    const summary = buildExpertiseSummary(
      evidence({
        contributionCount: 40,
        reviewedCount: 20,
        inboundCitationCount: 99,
        citableCount: 15,
      })
    );
    expect(summary).not.toMatch(/\b(leading|expert|top|renowned|highly regarded|best)\b/i);
    // No score, no percentage, no rating.
    expect(summary).not.toMatch(/%|\bscore\b|\brank/i);
  });
});

describe("expertise ranking", () => {
  it("keeps only qualified topics", () => {
    const ranked = rankDemonstratedExpertise([
      evidence({ key: "a", label: "A", contributionCount: 3 }),
      evidence({ key: "b", label: "B", contributionCount: 1 }),
    ]);
    expect(ranked.map((topic) => topic.key)).toEqual(["a"]);
  });

  it("puts stronger evidence first", () => {
    const ranked = rankDemonstratedExpertise([
      evidence({ key: "many", label: "Many", contributionCount: 5 }),
      evidence({
        key: "cited",
        label: "Cited",
        contributionCount: 2,
        inboundCitationCount: 3,
      }),
    ]);
    expect(ranked[0].key).toBe("cited");
  });

  it("is deterministic for identical evidence", () => {
    const topics = [
      evidence({ key: "b", label: "B", contributionCount: 2, lastContributionAt: null }),
      evidence({ key: "a", label: "A", contributionCount: 2, lastContributionAt: null }),
    ];
    expect(rankDemonstratedExpertise(topics).map((t) => t.key)).toEqual(["a", "b"]);
    expect(rankDemonstratedExpertise(topics)).toEqual(rankDemonstratedExpertise(topics));
  });
});

describe("representative work selection", () => {
  const works = [
    { postId: "p1", slug: "a", title: "A", occurredAt: "2026-01-01T00:00:00.000Z", reviewed: true },
    { postId: "p2", slug: "b", title: "B", occurredAt: "2026-08-01T00:00:00.000Z" },
    { postId: "p3", slug: "c", title: "C", occurredAt: "2026-07-01T00:00:00.000Z", inboundCitations: 2 },
  ];

  it("prefers strength over recency", () => {
    expect(selectRepresentativeWorks(works, 2).map((w) => w.postId)).toEqual(["p3", "p1"]);
  });

  it("is stable when strength and date tie", () => {
    const tied = [
      { postId: "z", slug: "z", title: "Z", occurredAt: "2026-01-01T00:00:00.000Z" },
      { postId: "a", slug: "a", title: "A", occurredAt: "2026-01-01T00:00:00.000Z" },
    ];
    expect(selectRepresentativeWorks(tied, 2).map((w) => w.postId)).toEqual(["a", "z"]);
  });
});

describe("topic evidence assembly", () => {
  const base = {
    postId: "p1",
    slug: "a",
    title: "A",
    occurredAt: "2026-08-01T00:00:00.000Z",
  };

  it("normalizes topics case-insensitively and keeps the first spelling", () => {
    const [topic] = buildTopicEvidence([
      { ...base, tags: ["Public Health"] },
      { ...base, postId: "p2", slug: "b", title: "B", tags: ["public health"] },
      { ...base, postId: "p3", slug: "c", title: "C", tags: ["PUBLIC HEALTH"] },
    ]);
    expect(topic.key).toBe("public health");
    expect(topic.label).toBe("Public Health");
    expect(topic.contributionCount).toBe(3);
  });

  it("counts each kind of evidence separately", () => {
    const [topic] = buildTopicEvidence([
      { ...base, tags: ["law"], sourceBacked: true, reviewed: true },
      {
        ...base,
        postId: "p2",
        slug: "b",
        title: "B",
        tags: ["law"],
        citable: true,
        isCoAuthor: true,
        inboundCitations: 2,
      },
    ]);
    expect(topic).toMatchObject({
      contributionCount: 2,
      sourceBackedCount: 1,
      reviewedCount: 1,
      citableCount: 1,
      coAuthoredCount: 1,
      inboundCitationCount: 2,
    });
  });

  it("keeps debate contributions out of the publication count", () => {
    const [topic] = buildTopicEvidence([
      { ...base, tags: ["law"] },
      { ...base, postId: "d1", tags: ["law"], isDebateContribution: true },
    ]);
    expect(topic.contributionCount).toBe(1);
    expect(topic.debateContributionCount).toBe(1);
  });

  it("ignores blank tags and produces no topic from none", () => {
    expect(buildTopicEvidence([{ ...base, tags: ["  ", ""] }])).toEqual([]);
    expect(buildTopicEvidence([{ ...base, tags: null }])).toEqual([]);
    expect(buildTopicEvidence([])).toEqual([]);
  });

  it("records the most recent contribution date", () => {
    const [topic] = buildTopicEvidence([
      { ...base, tags: ["law"], occurredAt: "2026-01-01T00:00:00.000Z" },
      { ...base, postId: "p2", tags: ["law"], occurredAt: "2026-09-01T00:00:00.000Z" },
    ]);
    expect(topic.lastContributionAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("takes no declared interests, only work", () => {
    // The function signature accepts contributions, not interests: a declared
    // interest has no shape it could enter through.
    const [topic] = buildTopicEvidence([{ ...base, tags: ["law"] }]);
    expect(topic.contributionCount).toBe(1);
    expect(Object.keys(topic)).not.toContain("interests");
  });
});
