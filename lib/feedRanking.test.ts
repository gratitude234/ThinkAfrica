import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_POSTS_PER_AUTHOR_PER_WINDOW,
  type RankablePost,
  type RankingContext,
  rankPosts,
  scorePost,
} from "./feedRanking";

const NOW = new Date("2026-08-18T12:00:00.000Z");

const anonymousContext: RankingContext = {
  userId: null,
  followedIds: new Set(),
  userInterests: [],
  userUniversity: null,
  userCountry: null,
};

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
    profiles: {
      username: "writer",
      full_name: "Writer",
      university: "University of Lagos",
      avatar_url: null,
      verified: false,
    },
    ...overrides,
  };
}

describe("scorePost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("never rewards additional impressions", () => {
    const engaged = {
      view_count: 40,
      read_count: 18,
      like_count: 5,
      bookmark_count: 3,
      response_count: 1,
    };

    const lowExposure = scorePost(
      post({ ...engaged, impression_count: 50 }),
      anonymousContext
    );
    const highExposure = scorePost(
      post({ ...engaged, impression_count: 500 }),
      anonymousContext
    );

    expect(highExposure).toBeLessThan(lowExposure);
    expect(
      scorePost(post({ impression_count: 500 }), anonymousContext)
    ).toBeLessThan(
      scorePost(post({ impression_count: 50 }), anonymousContext)
    );
  });

  it("counts a positive action once with diminishing returns", () => {
    const scoreWithLikes = (likeCount: number) =>
      scorePost(
        post({ impression_count: 100, like_count: likeCount }),
        anonymousContext
      );

    const firstIncrement = scoreWithLikes(2) - scoreWithLikes(1);
    const laterIncrement = scoreWithLikes(21) - scoreWithLikes(20);

    expect(scoreWithLikes(2)).toBeGreaterThan(scoreWithLikes(1));
    expect(scoreWithLikes(21)).toBeGreaterThan(scoreWithLikes(20));
    expect(laterIncrement).toBeLessThan(firstIncrement);
  });

  it("does not add the derived helper quality score a second time", () => {
    const base = post({
      impression_count: 100,
      read_count: 12,
      bookmark_count: 2,
      quality_score: 0,
    });

    expect(
      scorePost({ ...base, quality_score: 10_000 }, anonymousContext)
    ).toBe(scorePost(base, anonymousContext));
  });

  it("raises relevant work through followed-author and normalized interest affinity", () => {
    const candidate = post({
      author_id: "followed-author",
      tags: ["Public Policy"],
    });
    const relevantContext: RankingContext = {
      ...anonymousContext,
      userId: "reader-1",
      followedIds: new Set(["followed-author"]),
      userInterests: [" public policy "],
      userUniversity: "university of lagos",
    };

    expect(scorePost(candidate, relevantContext)).toBeGreaterThan(
      scorePost(candidate, anonymousContext)
    );
  });

  it("decays older work with longer half-lives for Articles and Research", () => {
    const sevenDaysAgo = new Date(
      NOW.getTime() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const freshPost = scorePost(post(), anonymousContext);
    const oldPost = scorePost(
      post({ published_at: sevenDaysAgo, content_kind: "post" }),
      anonymousContext
    );
    const oldArticle = scorePost(
      post({ published_at: sevenDaysAgo, content_kind: "article" }),
      anonymousContext
    );
    const oldResearch = scorePost(
      post({ published_at: sevenDaysAgo, content_kind: "research" }),
      anonymousContext
    );

    expect(oldPost).toBeLessThan(freshPost);
    expect(oldArticle).toBeGreaterThan(oldPost);
    expect(oldResearch).toBeGreaterThan(oldArticle);
  });

  it("keeps even saturated feature combinations within the 0..100 range", () => {
    const maximalContext: RankingContext = {
      ...anonymousContext,
      followedIds: new Set(["author-1"]),
      userInterests: ["economics"],
      userUniversity: "University of Lagos",
    };
    const score = scorePost(
      post({
        tags: ["Economics"],
        view_count: 1_000_000,
        read_count: 1_000_000,
        like_count: 1_000_000,
        bookmark_count: 1_000_000,
        response_count: 1_000_000,
        reference_count: 1_000_000,
        citation_id: "citation-1",
      }),
      maximalContext
    );

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("rankPosts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses publication time and then id as deterministic score tie-breakers", () => {
    const oneHourAgo = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
    const candidates = [
      post({ id: "b", slug: "b", author_id: "b" }),
      post({ id: "c", slug: "c", author_id: "c", published_at: oneHourAgo }),
      post({ id: "a", slug: "a", author_id: "a" }),
    ];

    expect(rankPosts(candidates, anonymousContext).map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("caps authors at two per 12-item window when inventory permits", () => {
    const candidates = [
      ...Array.from({ length: 4 }, (_, index) =>
        post({
          id: `a-${index}`,
          slug: `a-${index}`,
          author_id: "author-a",
        })
      ),
      ...["b", "c", "d", "e", "f"].flatMap((author) =>
        Array.from({ length: 2 }, (_, index) =>
          post({
            id: `${author}-${index}`,
            slug: `${author}-${index}`,
            author_id: `author-${author}`,
          })
        )
      ),
    ];

    const ranked = rankPosts(candidates, anonymousContext);
    const counts = ranked.slice(0, 12).reduce<Record<string, number>>(
      (acc, candidate) => {
        const authorId = candidate.author_id ?? "missing";
        acc[authorId] = (acc[authorId] ?? 0) + 1;
        return acc;
      },
      {}
    );

    expect(Math.max(...Object.values(counts))).toBe(
      MAX_POSTS_PER_AUTHOR_PER_WINDOW
    );
    expect(ranked).toHaveLength(candidates.length);
    expect(new Set(ranked.map((candidate) => candidate.id))).toEqual(
      new Set(candidates.map((candidate) => candidate.id))
    );
  });

  it("counts accepted coauthors toward the author cap", () => {
    const sharedCoauthorPosts = Array.from({ length: 4 }, (_, index) =>
      post({
        id: `a-shared-${index}`,
        slug: `shared-${index}`,
        author_id: `primary-${index}`,
        co_authors: [
          {
            user_id: "prolific-coauthor",
            profile: { username: "prolific", full_name: "Prolific Coauthor" },
          },
        ],
      })
    );
    const alternatives = Array.from({ length: 10 }, (_, index) =>
      post({
        id: `b-alternative-${index.toString().padStart(2, "0")}`,
        slug: `alternative-${index}`,
        author_id: `alternative-author-${index}`,
      })
    );
    const candidates = [...sharedCoauthorPosts, ...alternatives];

    const ranked = rankPosts(candidates, anonymousContext);
    const sharedCoauthorCount = ranked
      .slice(0, 12)
      .filter((candidate) =>
        candidate.co_authors?.some(
          (coAuthor) => coAuthor.user_id === "prolific-coauthor"
        )
      ).length;

    expect(sharedCoauthorCount).toBe(MAX_POSTS_PER_AUTHOR_PER_WINDOW);
    expect(ranked.slice(12).map((candidate) => candidate.id)).toEqual([
      "a-shared-2",
      "a-shared-3",
    ]);
    expect(ranked).toHaveLength(candidates.length);
    expect(new Set(ranked.map((candidate) => candidate.id))).toEqual(
      new Set(candidates.map((candidate) => candidate.id))
    );
  });

  it("alternates primary topics when alternatives exist", () => {
    const candidates = [
      ...Array.from({ length: 3 }, (_, index) =>
        post({
          id: `0-climate-${index}`,
          slug: `climate-${index}`,
          author_id: `climate-author-${index}`,
          tags: ["Climate"],
        })
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        post({
          id: `1-economy-${index}`,
          slug: `economy-${index}`,
          author_id: `economy-author-${index}`,
          tags: ["Economy"],
        })
      ),
    ];

    const topics = rankPosts(candidates, anonymousContext).map(
      (candidate) => candidate.tags?.[0]
    );

    for (let index = 1; index < topics.length; index += 1) {
      expect(topics[index]).not.toBe(topics[index - 1]);
    }
  });

  it("retains all posts when diversity constraints cannot be satisfied", () => {
    const candidates = Array.from({ length: 15 }, (_, index) =>
      post({
        id: `single-${index.toString().padStart(2, "0")}`,
        slug: `single-${index}`,
        author_id: "only-author",
        tags: ["Only topic"],
      })
    );

    const ranked = rankPosts(candidates, anonymousContext);

    expect(ranked).toHaveLength(candidates.length);
    expect(new Set(ranked.map((candidate) => candidate.id))).toEqual(
      new Set(candidates.map((candidate) => candidate.id))
    );
  });
});
