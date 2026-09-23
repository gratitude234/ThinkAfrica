import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIVERSITY_WINDOW_SIZE,
  FRESHNESS_HALF_LIFE_HOURS,
  MAX_POSTS_PER_AUTHOR_PER_WINDOW,
  MAX_POSTS_PER_TOPIC_PER_WINDOW,
  RELEVANCE_WEIGHTS,
  SCORE_WEIGHTS,
  rankPosts,
  scorePost,
  scorePostBreakdown,
  type RankablePost,
  type RankingContext,
} from "./feedRanking";

const NOW = new Date("2026-09-15T12:00:00.000Z");

const anonymous: RankingContext = {
  userId: null,
  followedIds: new Set(),
  userInterests: [],
  snapshotAt: NOW,
};

function hoursAgo(hours: number) {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

function post(overrides: Partial<RankablePost> = {}): RankablePost {
  return {
    id: "post-1",
    author_id: "author-1",
    title: "A useful post",
    slug: "a-useful-post",
    excerpt: "An excerpt",
    type: "blog",
    content_kind: "post",
    tags: [],
    created_at: NOW.toISOString(),
    published_at: NOW.toISOString(),
    profiles: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("scorePost", () => {
  it("stays within 0..100 however strong every signal is", () => {
    const strongest = post({
      tags: ["Climate"],
      read_count: 100_000,
      like_count: 100_000,
      comment_count: 100_000,
      bookmark_count: 100_000,
    });
    const score = scorePost(strongest, {
      userId: "reader",
      followedIds: new Set(["author-1"]),
      userInterests: ["climate"],
      snapshotAt: NOW,
      authorAffinity: new Map([["author-1", 1]]),
      topicAffinity: new Map([["climate", 1]]),
    });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(scorePost(post({ published_at: "2001-01-01T00:00:00.000Z" }), anonymous)).toBeGreaterThanOrEqual(0);
  });

  it("ranks a followed writer above the same post from a stranger", () => {
    const followed = scorePost(post(), {
      ...anonymous,
      followedIds: new Set(["author-1"]),
    });
    expect(followed - scorePost(post(), anonymous)).toBeCloseTo(
      100 * SCORE_WEIGHTS.relevance * RELEVANCE_WEIGHTS.followedAuthor,
      6
    );
  });

  it("counts a topic the reader chose, whatever its case or spacing", () => {
    const withTopic = scorePost(post({ tags: ["Climate Policy"] }), {
      ...anonymous,
      userInterests: ["  climate POLICY "],
    });
    expect(withTopic - scorePost(post({ tags: ["Climate Policy"] }), anonymous)).toBeCloseTo(
      100 * SCORE_WEIGHTS.relevance * RELEVANCE_WEIGHTS.topic,
      6
    );
  });

  it("rewards qualified reads and saves more strongly than lightweight reactions", () => {
    const baseline = post({ impression_count: 100 });
    const read = scorePost(post({ impression_count: 100, read_count: 10 }), anonymous);
    const saved = scorePost(post({ impression_count: 100, bookmark_count: 10 }), anonymous);
    const liked = scorePost(post({ impression_count: 100, like_count: 10 }), anonymous);
    const commented = scorePost(post({ impression_count: 100, comment_count: 10 }), anonymous);

    expect(read).toBeGreaterThan(scorePost(baseline, anonymous));
    expect(saved).toBeGreaterThan(liked);
    expect(commented).toBeGreaterThan(liked);
  });

  it("never raises satisfaction for exposure alone and reduces exploration as exposure grows", () => {
    const unseen = scorePostBreakdown(post({ impression_count: 0 }), anonymous);
    const exposed = scorePostBreakdown(post({ impression_count: 10_000 }), anonymous);
    expect(exposed.satisfaction).toBe(unseen.satisfaction);
    expect(exposed.exploration).toBeLessThan(unseen.exploration);
    expect(exposed.total).toBeLessThanOrEqual(unseen.total);

    expect(scorePost(post({ read_count: 10, impression_count: 1_000 }), anonymous)).toBeLessThan(
      scorePost(post({ read_count: 10, impression_count: 0 }), anonymous)
    );
  });

  it("halves the freshness component every two days", () => {
    const fresh = scorePostBreakdown(post(), anonymous);
    const halfLife = scorePostBreakdown(
      post({ published_at: hoursAgo(FRESHNESS_HALF_LIFE_HOURS) }),
      anonymous
    );
    expect(fresh.freshness).toBeCloseTo(1, 6);
    expect(halfLife.freshness).toBeCloseTo(0.5, 6);
  });

  it("learns from qualified-read writer and topic affinity without replacing explicit interests", () => {
    const candidate = post({ tags: ["Climate Policy"] });
    const learned = scorePostBreakdown(candidate, {
      ...anonymous,
      authorAffinity: new Map([["author-1", 1]]),
      topicAffinity: new Map([["climate policy", 0.5]]),
    });
    const cold = scorePostBreakdown(candidate, anonymous);

    expect(learned.writerAffinity).toBeGreaterThan(cold.writerAffinity);
    expect(learned.total).toBeGreaterThan(cold.total);
  });

  it("penalizes repeated exposure and especially a publication already read", () => {
    const candidate = post();
    const unseen = scorePost(candidate, anonymous);
    const repeated = scorePost(candidate, {
      ...anonymous,
      viewerEngagement: new Map([[candidate.id, { impressions: 3, hasRead: false }]]),
    });
    const alreadyRead = scorePost(candidate, {
      ...anonymous,
      viewerEngagement: new Map([[candidate.id, { impressions: 3, hasRead: true }]]),
    });

    expect(unseen).toBeGreaterThan(repeated);
    expect(repeated).toBeGreaterThan(alreadyRead);
  });

  it("reads no signal from retired product metadata", () => {
    const retired = {
      ...post(),
      citation_id: "IND-2026-0001",
      published_version_id: "version-1",
      view_count: 99_999,
      reference_count: 12,
      co_authors: [{ user_id: "author-2" }],
      quality_score: 99,
      profiles: {
        username: "amara",
        full_name: "Amara",
        university: "University of Lagos",
        avatar_url: null,
        verified: true,
      },
    } as RankablePost;
    const universityReader = {
      ...anonymous,
      userUniversity: "University of Lagos",
    } as RankingContext;

    expect(scorePost(retired, universityReader)).toBe(scorePost(post(), anonymous));
  });
});

describe("rankPosts", () => {
  it("guarantees a fresh cold-start candidate a place in the first screen", () => {
    const established = Array.from({ length: 12 }, (_, index) =>
      post({
        id: `old-${index}`,
        author_id: `old-author-${index}`,
        published_at: hoursAgo(72 + index),
        created_at: hoursAgo(72 + index),
        impression_count: 500,
        read_count: 150,
        bookmark_count: 30,
      })
    );
    const fresh = post({
      id: "fresh-cold-start",
      author_id: "new-writer",
      impression_count: 0,
      read_count: 0,
    });

    const ranked = rankPosts([...established, fresh], anonymous);
    expect(ranked.slice(0, DIVERSITY_WINDOW_SIZE).map((item) => item.id)).toContain(
      "fresh-cold-start"
    );
    expect(ranked.find((item) => item.id === "fresh-cold-start")?.candidate_source).toBe(
      "for_you_fresh"
    );
  });

  it("keeps one writer to two posts per block of twelve when alternatives exist, and drops nobody", () => {
    const prolific = Array.from({ length: 6 }, (_, index) =>
      post({ id: `a${index}`, author_id: "prolific", read_count: 500 })
    );
    const others = Array.from({ length: 12 }, (_, index) =>
      post({ id: `o${index}`, author_id: `writer-${index}` })
    );

    const ranked = rankPosts([...prolific, ...others], anonymous);

    expect(ranked).toHaveLength(18);
    expect(new Set(ranked.map((item) => item.id)).size).toBe(18);
    expect(
      ranked.slice(0, DIVERSITY_WINDOW_SIZE).filter((item) => item.author_id === "prolific")
    ).toHaveLength(MAX_POSTS_PER_AUTHOR_PER_WINDOW);
  });

  it("keeps one topic from monopolizing a screen when alternatives exist", () => {
    const oneTopic = Array.from({ length: 9 }, (_, index) =>
      post({
        id: `climate-${index}`,
        author_id: `climate-author-${index}`,
        tags: ["Climate"],
        read_count: 500,
      })
    );
    const alternatives = Array.from({ length: 8 }, (_, index) =>
      post({
        id: `other-${index}`,
        author_id: `other-author-${index}`,
        tags: [`Topic ${index}`],
      })
    );

    const ranked = rankPosts([...oneTopic, ...alternatives], anonymous);
    expect(
      ranked
        .slice(0, DIVERSITY_WINDOW_SIZE)
        .filter((item) => item.tags?.includes("Climate"))
    ).toHaveLength(MAX_POSTS_PER_TOPIC_PER_WINDOW);
  });

  it("avoids placing the same writer consecutively when another candidate is available", () => {
    const ranked = rankPosts(
      [
        post({ id: "a1", author_id: "a", read_count: 500 }),
        post({ id: "a2", author_id: "a", read_count: 450 }),
        post({ id: "b1", author_id: "b", read_count: 10 }),
        post({ id: "c1", author_id: "c", read_count: 5 }),
      ],
      anonymous
    );

    for (let index = 1; index < ranked.length; index += 1) {
      if (ranked[index - 1].author_id === ranked[index].author_id) {
        const laterDifferentAuthor = ranked.slice(index + 1).some(
          (item) => item.author_id !== ranked[index].author_id
        );
        expect(laterDifferentAuthor).toBe(false);
      }
    }
  });

  it("uses score order as the fallback when every candidate is by the same writer", () => {
    const ranked = rankPosts(
      [
        post({ id: "low", read_count: 1, published_at: hoursAgo(72) }),
        post({ id: "high", read_count: 90, published_at: hoursAgo(72) }),
        post({ id: "mid", read_count: 20, published_at: hoursAgo(72) }),
      ],
      anonymous
    );
    expect(ranked.map((item) => item.id)).toEqual(["high", "mid", "low"]);
  });
});
