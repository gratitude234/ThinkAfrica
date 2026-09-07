# The post page query path

An audit of what `GET /post/[slug]` actually asks the database for, why the same
post was being looked up twice per request, and what the request costs now.

Written during the investigation into the repeated Supabase degradations
(connection timeouts, PostgREST schema-cache failures, REST 522, Auth 504,
Vercel 300-second function timeouts).

---

## 1. What renders a post page

| Stage | File | Runs |
|---|---|---|
| Middleware | [proxy.ts](../proxy.ts) | Returns early. `/post/*` is neither protected nor `/`, so no Supabase client is created and no auth call is made |
| Layout | [app/(main)/layout.tsx](../app/(main)/layout.tsx) | `auth.getSession()` (cookie read, no network). For a signed-out visitor both of its queries are skipped |
| Metadata | `generateMetadata()` in [app/(main)/post/[slug]/page.tsx](../app/\(main\)/post/[slug]/page.tsx) | Title, description, canonical, OG and Twitter cards |
| Page | `PostPage()` in the same file | The whole article template |
| Sections | ~14 async server components in the same file | Each one `await`s a promise the page already started. None starts its own query |
| Discussion | [DiscussionSection.tsx](../app/\(main\)/post/[slug]/DiscussionSection.tsx) → [CommentsLoader.tsx](../app/\(main\)/post/[slug]/CommentsLoader.tsx) | The comment thread, inside its own Suspense boundary |

Three templates branch off the resolved content kind, and exactly one renders:
`post` (the conversation view), `research` (the dossier), and everything else
(the article template).

---

## 2. The duplicate, and why it happened

`generateMetadata()` and `PostPage()` are separate exported functions. Neither
can see the other's local variables, so each opened its own Supabase client and
ran its own lookup:

```ts
// generateMetadata(), before
const { data: post } = await supabase
  .from("posts")
  .select("title, excerpt, content, cover_image_url, slug, status, author_id, type, profiles!...")
  .eq("slug", slug)
  .in("status", ["published", "pending", "pending_revision", "draft"])
  .maybeSingle();
```

```ts
// PostPage(), before
const { data: postRaw } = await supabase
  .from("posts")
  .select(`id, title, slug, content, excerpt, ... profiles!... `)
  .eq("slug", slug)
  .in("status", ["published", "pending", "pending_revision", "draft"])
  .maybeSingle();
```

Same table, same slug, same status filter, overlapping columns, `content`
included in both. Each also called `supabase.auth.getUser()`, which is not a
cookie read: it posts the token to Supabase Auth and waits for validation.

This is not an occasional race. Next.js composes the `Metadata` element into the
same React flight tree as the page (`createMetadataComponents` in
`next/dist/server/app-render/app-render.js`), so `generateMetadata` runs inside
the same server render as the page component, on every request. The production
evidence was the pair of log lines the old error handler emitted:

```
[post/<slug>] metadata query failed
[post/<slug>] page query failed
```

Two stages, one request, one post.

Per request that was **2 full post rows including the `content` column** and
**2 Auth round trips**, before the page had rendered anything.

---

## 3. The fix

[lib/postBySlug.ts](../lib/postBySlug.ts) holds the one core lookup, and
[lib/serverAuth.ts](../lib/serverAuth.ts) holds the one session validation. Both
are wrapped in React's `cache()`:

```ts
export const getPostBySlug = cache(loadPostBySlug);
```

`generateMetadata()` and `PostPage()` both call it. Whichever runs first pays
for the query; the other gets the same promise.

### Why `cache()` and not something else

Verified against the installed versions, `next@16.2.4` and `react@19.2.5`:

- **`cache()` from `react`** memoises for the lifetime of one server render, and
  Next.js installs the cache dispatcher per request. It is exactly the window
  the duplicate lived in. This is what we use.
- **`unstable_cache` / `"use cache"`** persist across requests. Wrong here, and
  unsafe: the row includes `draft`, `pending` and `pending_revision` posts,
  which the caller then gates against the viewer's own id. A cross-request cache
  would serve one author's unpublished draft to the next visitor.
- **A second helper containing the same query** would have been two queries with
  one name. The memo has to wrap the database call itself, which is why the
  `.from("posts")` lives inside the cached function and nowhere else.

### What the shared loader may contain

Public, core post data only. Everything viewer-specific stays outside it, in
`getViewerData()`:

| Shared, memoised | Kept out, per viewer |
|---|---|
| The `posts` row and its author profile | Like state |
| | Bookmark state |
| | Follow / subscription state |
| | Message eligibility |
| | Draft and in-review visibility decisions |

`getCurrentUser()` is memoised too, but it is the *identity*, not a permission:
the gating decisions are still made per call site against that identity.

---

## 4. Full fan-out for one request

A published article, with comments, no responses, not a reply to anything.
"Round trips" counts Supabase HTTP calls, so an Auth validation counts as one.

### Signed out

| | Before | After |
|---|---:|---:|
| Auth (`getUser`, network) | 2 | **1** |
| Core post (by slug) | 2 | **1** |
| Author profile | 0 (joined into the post row) | 0 |
| Likes (count) | 1 | 1 |
| Bookmarks (count) | 1 | 1 |
| Comments (count) | 2 | **1** |
| Comments (page + replies) | 2 | 2 |
| Responses (cards) | 1 | 1 |
| Responses (count) | 1 | 1 |
| References | 1 | 1 |
| Co-authors | 1 | 1 |
| Reviews | 1 | 1 |
| Editor decisions | 1 | 1 |
| Versions | 1 | 1 |
| Related posts | 1 | 1 |
| Previous post | 1 | 1 |
| Next post | 1 | 1 |
| **Total round trips** | **20** | **17** |

Three fewer per view, and the two removed database queries are the expensive
kind: a full post row carrying the article body, and an Auth validation.

### Signed in

Adds, unchanged by this work:

| | Count |
|---|---:|
| Layout: own profile | 1 |
| Layout: `record_user_activity_day` RPC | 1 |
| Viewer: like state | 1 |
| Viewer: bookmark state | 1 |
| Viewer: follow state | 1 |
| Viewer: `is_blocked_pair` RPC | 1 |
| Comments: own votes | 1 |
| Viewer: author subscription | 1 only when `NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED=1` |

### Conditional extras

| Condition | Extra |
|---|---:|
| The post is a reply | +1 (parent post by id) |
| Responses exist | +5 (`enrichPosts`: posts, profiles, post_authors, likes, bookmarks) |
| Post is `pending` / `pending_revision` and the viewer is not the author | +2 (reviewer assignment, co-author invite) |
| `?responses=N` | no extra queries, a larger page size on the existing one |

---

## 5. What was deduplicated, and what was left alone

**Fixed:**

1. **The core post lookup.** Two identical slug lookups per request, now one
   memoised call.
2. **`auth.getUser()`.** Two Auth round trips per request, now one.
3. **`countComments()`.** `getSecondaryData()` counted comments for the
   "Discussion · N" heading, and `CommentsLoader` counted them again with the
   same post id for `CommentThread`'s `initialTotalCount`. The count is now
   passed down as a prop.

**Deliberately left alone:**

- `getSecondaryData()`'s 13 parallel queries. They are 13 *different* questions,
  already issued in one `Promise.all`, and already shared across every section
  component through a single promise. Collapsing them into RPCs or views is a
  real optimisation, and a separate piece of work.
- `createClient()` being called several times per request. It is local object
  construction over `cookies()`, with no network cost. Memoising it globally
  would change the client's identity in server actions across the whole
  application, which is far outside this scope.
- The parent-post lookup in `ParentPostLink` / `ParentContextLine`. Only one
  template renders, so only one of them ever runs.

---

## 6. Fail-fast at the Supabase boundary

Separate from the duplication, and the reason a bad database produced
300-second Vercel timeouts: a Supabase call had no deadline. When Postgres
stopped answering, the function waited, held its connection, and was eventually
killed by the platform having produced nothing.

[lib/supabase/fetchTimeout.ts](../lib/supabase/fetchTimeout.ts) wraps the fetch
used by [lib/supabase/server.ts](../lib/supabase/server.ts):

- **8 seconds** by default, configurable with `SUPABASE_SERVER_TIMEOUT_MS`
  (`0` disables it).
- **PostgREST (`/rest/v1/`) and Auth (`/auth/v1/`) only.** Storage is exempt:
  `/storage/v1/` moves manuscript PDFs and cover images, where multi-second
  transfers are normal.
- **No retry.** During connection exhaustion a retry is not a second chance, it
  is a second connection.
- A caller's own `AbortSignal` is preserved; whichever fires first wins, and a
  caller-initiated abort is re-thrown unchanged rather than relabelled.

`createAdminClient()` in `lib/supabase/admin.ts` is a different module and is
untouched, so the nightly Resend sync and the other cron routes keep their full
budget.

The outcome: a database outage now produces a fast, logged 500 that the route's
error boundary can render, instead of a five-minute hang.

---

## 7. Tests

| File | Proves |
|---|---|
| [lib/postBySlug.test.ts](../lib/postBySlug.test.ts) | Two calls with the same slug in one render issue one query; different slugs issue two; a second render does not reuse the first's row; the select carries no viewer-specific column; a failure raises rather than half-loading |
| [app/(main)/post/[slug]/postQueryPath.test.ts](../app/\(main\)/post/[slug]/postQueryPath.test.ts) | `generateMetadata` and `PostPage` both go through `getPostBySlug`; neither has its own slug lookup or `auth.getUser()`; the loader uses `cache` and not `unstable_cache`/`"use cache"`; `countComments` is called once; no Debate reference |
| [lib/supabase/fetchTimeout.test.ts](../lib/supabase/fetchTimeout.test.ts) | The deadline fires on PostgREST and Auth, never on storage, exactly once, and does not swallow a caller's own abort |

React's `cache()` cannot be observed directly under Vitest: the test runner
resolves `react` to the client build, whose `cache` is a bare passthrough
(`return fn.apply(null, arguments)`). Only the `react-server` build carries the
dispatcher that memoises. `lib/postBySlug.test.ts` therefore substitutes a
faithful stand-in and asserts the thing this module is actually responsible
for: that the database call sits *inside* the cached function.

To confirm it in production, set `POST_QUERY_DEBUG=1` and count the
`[post/<slug>] core post query executed` lines within one request id. One line
per slug is correct; two would mean the memo is not holding.

---

## 8. Secondary query classification, for the data-layer migration

Section 4 counts the round trips. This section says what each one is *for*, so
the Cloudflare caching and aggregate-query work has a starting point that is
not guesswork. Added during the Phase 1 audit; see
[database-access-inventory.md](database-access-inventory.md).

**Nothing below has been optimised.** Classifying is the deliverable.

The 13 slots are the `Promise.all` in `getSecondaryData()`, plus the two
comment queries in `fetchCommentPage()`. Every one is public: none depends on
the viewer, which is why they can be shared by every Suspense boundary on the
page from one promise, and why almost all of them are cacheable.

| # | Query | Class | Notes |
|---|---|---|---|
| 1 | `likes` count by `post_id` | **essential · public · cacheable · unnecessary as written** | `post_like_counts` has been the maintained counter since `20260715000004`, and [lib/postCounts.ts](../lib/postCounts.ts) already reads it. This page still counts rows. A post with 5,000 likes ships 5,000 rows to print "5,000" |
| 2 | `post_references` by `post_id` | essential · public · **mergeable** | Small ordered child table. A lateral `jsonb_agg` in the core query costs a fraction of a round trip |
| 3 | `post_authors` + embedded `profiles` | essential · public · **mergeable** | Same shape as 2. Its RLS is `accepted_at is not null`, which is a filter, not a viewer check |
| 4 | Responses page (`posts` where `in_response_to`) | essential · public · **deferrable** | Below the fold, inside its own Suspense boundary. When it returns rows it triggers `enrichPosts`, which is **+5 more queries**. The single most expensive slot |
| 5 | `post_reviews` | **conditional** · public | Only rendered for a reviewed work. Runs on every view, including the blog posts that can never have reviews |
| 6 | `post_editor_decisions` | **conditional** · public | Same |
| 7 | `post_versions` | **conditional** · public | Same. 5-7 are one gate away from disappearing for most views: `isReviewedWork(post)` is already computed from the core row |
| 8 | `posts` count where `in_response_to` | **mergeable with 4** | Second pass over the index slot 4 already read. A window count on that query removes it |
| 9 | `comments` count (`countComments`) | essential · public · **mergeable with 14** | Deliberately not a counter table: the count is per-viewer because RLS on `comments` hides moderated rows, and an author still sees their own. `20260820000001` explains the decision |
| 10 | `bookmarks` count | **unnecessary as written** · public · cacheable | Same finding as 1. `post_bookmark_counts` exists and is maintained |
| 11 | Related posts (tag overlap) | **cacheable across requests** · public · deferrable | Global scan over published posts with an array-overlap predicate. Not viewer-specific and not time-sensitive; the natural first thing to put behind a Cloudflare cache |
| 12 | Previous post by `published_at` | cacheable · **mergeable with 13** | |
| 13 | Next post by `published_at` | cacheable · **mergeable with 12** | 12 and 13 are one query with two window functions. Both are global orderings over every published post and change only when something publishes |
| 14 | Comments: top-level page | essential · public | Keyset-paginated, `pageSize + 1` |
| 15 | Comments: replies for that page | essential · public · **mergeable with 14** | Two round trips for one thread. A lateral join or a recursive CTE makes it one |

### What that adds up to

| Bucket | Slots | Effect if acted on |
|---|---|---|
| Merge into an existing query | 2, 3, 8, 12, 13, 15 | -6 round trips |
| Skip unless the post is a reviewed work | 5, 6, 7 | -3 for most views |
| Read the maintained counter instead of counting rows | 1, 10 | -0 round trips, but stops shipping N rows to print N |
| Cache across requests (public, not time-sensitive) | 11, 12, 13 | -3 on a warm cache |
| Defer below the fold | 4, 11 | Off the critical path, not off the total |

17 round trips could plausibly become 6 to 8 without changing a single thing a
reader sees. That is the work the direct SQL layer makes worth doing: under
PostgREST each of these is an HTTP request, and merging them means learning
PostgREST's embedding rules; under SQL they are joins.

### The viewer additions, for completeness

For a signed-in reader `getViewerData()` adds five, and they are the ones that
are **not** cacheable and **not** mergeable into the shared memo, because each
is per-viewer: like state, bookmark state, follow state, author subscription
(flag-gated), and the `is_blocked_pair` RPC. `fetchCommentPage` adds a sixth,
the viewer's own comment votes. Keeping these out of `getPostBySlug` is what
makes the shared memo safe, and that separation has to survive the migration:
see [lib/db/types.ts](../lib/db/types.ts).
