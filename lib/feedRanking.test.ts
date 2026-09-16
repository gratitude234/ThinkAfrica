import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIVERSITY_WINDOW_SIZE,
  FRESHNESS_HALF_LIFE_HOURS,
  MAX_POSTS_PER_AUTHOR_PER_WINDOW,
  RELEVANCE_WEIGHTS,
  SCORE_WEIGHTS,
  rankPosts,
  scorePost,
  type RankablePost,
  type RankingContext,
} from "./feedRanking";

const NOW = new Date("2026-09-15T12:00:00.000Z");

const anonymous: RankingContext = {
  userId: null,
  followedIds: new Set(),
  userInterests: [],
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
      bookmark_count: 100_000,
    });
    const score = scorePost(strongest, {
      userId: "reader",
      followedIds: new Set(["author-1"]),
      userInterests: ["climate"],
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

  it("rewards reads, likes and saves relative to how often a post was shown", () => {
    const wellRead = post({ impression_count: 100, read_count: 30 });
    const barelyRead = post({ impression_count: 100, read_count: 3 });
    expect(scorePost(wellRead, anonymous)).toBeGreaterThan(scorePost(barelyRead, anonymous));

    const liked = post({ impression_count: 100, like_count: 10 });
    const saved = post({ impression_count: 100, bookmark_count: 10 });
    expect(scorePost(liked, anonymous)).toBeGreaterThan(scorePost(post(), anonymous));
    expect(scorePost(saved, anonymous)).toBeGreaterThan(scorePost(post(), anonymous));
  });

  it("never raises a score for exposure alone", () => {
    expect(scorePost(post({ impression_count: 10_000 }), anonymous)).toBe(
      scorePost(post({ impression_count: 0 }), anonymous)
    );
    expect(scorePost(post({ read_count: 10, impression_count: 1_000 }), anonymous)).toBeLessThan(
      scorePost(post({ read_count: 10, impression_count: 0 }), anonymous)
    );
  });

  it("halves freshness every day and a half", () => {
    const fresh = scorePost(post(), anonymous);
    const halfLife = scorePost(
      post({ published_at: hoursAgo(FRESHNESS_HALF_LIFE_HOURS) }),
      anonymous
    );
    expect(fresh).toBeCloseTo(100 * SCORE_WEIGHTS.freshness, 6);
    expect(halfLife).toBeCloseTo(fresh / 2, 6);
  });

  it("reads no signal from a retired product", () => {
    // Citation identity, formal review, views, references, co-authorship and
    // a shared university all used to move the score. None of them does now.
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
  it("orders by score, then newest, then id", () => {
    const old = (id: string, publishedAt: string) =>
      post({ id, author_id: id, published_at: publishedAt, created_at: publishedAt });
    const ranked = rankPosts(
      [
        old("b", "2020-01-01T00:00:00.000Z"),
        old("a", "2020-01-01T00:00:00.000Z"),
        old("c", "2020-01-02T00:00:00.000Z"),
        post({ id: "read", author_id: "read", read_count: 50 }),
      ],
      anonymous
    );
    expect(ranked.map((item) => item.id)).toEqual(["read", "c", "a", "b"]);
    expect(ranked[0].score).toBeGreaterThan(0);
  });

  it("keeps one writer to two posts per block of twelve, and drops nobody", () => {
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

  it("uses the next best post when every candidate is by the same writer", () => {
    const ranked = rankPosts(
      [
        post({ id: "low", read_count: 1 }),
        post({ id: "high", read_count: 90 }),
        post({ id: "mid", read_count: 20 }),
      ],
      anonymous
    );
    expect(ranked.map((item) => item.id)).toEqual(["high", "mid", "low"]);
  });
});
