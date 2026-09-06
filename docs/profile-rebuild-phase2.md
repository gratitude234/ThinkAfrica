# Profile rebuild, Phase 2

The data architecture the two-format profile needs. No tab UI: Phase 3
consumes what this builds.

Companion to [`profile-rebuild-phase1.md`](./profile-rebuild-phase1.md) and
[`profile-rebuild-phase1-5.md`](./profile-rebuild-phase1-5.md).

**Phase 3 was not started.**

---

## 1. Summary

Five things changed.

**The false 404 is gone.** A database failure and a missing profile were the
same branch, so an outage told every visitor that every member's profile did
not exist. They are now different answers with different outcomes, and the
distinction is enforced by the loader rather than remembered at each call site.

**The record model can tell an Article from a Post.** `profile_record_entries`
gains a `content_kind` column resolved through the same
`effective_content_kind` the posts constraint already uses, and a second
summary function returns `article_count` and `post_count` beside the counts it
already returned. No table, no new column on `posts`, no backfill.

**There is a profile data layer.** `lib/profileViewData.ts` holds the query
plan for all four upcoming views, so Overview, Articles, Posts and About share
one way of loading identity and viewer context and differ only in what they
actually show.

**The public profile stopped paying for things it does not render.** No
researcher profile, no credibility graph, and no second round trip to fetch
the work behind a featured selection.

**The query plan went from five serial waves to two.**

---

## 2. Files

### Added

| File | |
|---|---|
| `supabase/migrations/20260907000001_profile_content_split.sql` | The view column and the v2 summary function |
| `lib/profileViewData.ts` | The server-side profile data layer |
| `lib/profileViewData.test.ts` | 17 tests: outage handling, viewer context, the content split |
| `lib/profileRecordData.test.ts` | 6 tests: the v2/v1 summary seam |
| `lib/profileContentSplitMigration.test.ts` | 17 tests: the migration's contracts and what the profile path no longer loads |

### Modified

| File | |
|---|---|
| `app/(main)/[username]/page.tsx` | Rewritten onto the loader; outage fix; Research and credibility removed |
| `lib/profileRecord.ts` | `articleCount` / `postCount` on the summary, and a normaliser that keeps "unknown" distinct from zero |
| `lib/profileRecordData.ts` | v2-then-v1 summary fetch; bounded topic scan |
| `lib/contentModel.ts` | `legacyTypesForContentKind`, so the legacy mapping is not rewritten in a query |
| `lib/featureFlags.ts` | Documented the confirmed production state of all three gates |
| `lib/profileRecord.test.ts` | Split coverage, including the unknown-versus-zero rule |
| `lib/profilePositioningStatement.test.ts` | Follows the gate into the loader |
| `lib/profileZeroStates.test.ts` | Follows the record preview's new shape |
| `tsconfig.check.json` | Four more files actually type-checked |

---

## 3. The outage bug

### What it was

```ts
const [{ data: profileData }, { data: userData }] = await Promise.all([...]);
const profile = profileData as ProfileRecord | null;
if (!profile) notFound();
```

The error was destructured away. Supabase returns `{ data: null, error }` on
failure, so a timeout, a 502 from the gateway, or a paused project all
arrived as `profile === null` and were reported as "this person does not
exist". A 404 is also the worst possible shape for the mistake: there is
nothing to retry and no reason to come back.

### What it is now

`loadProfileIdentity` returns `null` **only** for an answer, and throws for a
failure. `loadProfileView` inherits that, and the route reads it:

```ts
if (!data?.overview) notFound();
```

Null still means genuinely absent: no such username, a row RLS declined to
reveal, a suspended or members-only profile seen by someone who may not see
it. Everything else throws and lands on the segment error boundary added in
Phase 1.

Every loader states which side of the line it is on. All of them are
identity-critical in this phase and therefore throw, including the follower
and following counts: a header that prints "0 followers" for someone with
thousands because a count query timed out is stating a fact the database never
asserted. Nothing degrades silently. The classification is written down at
each loader so that adding a degradable section in Phase 3 is a decision
rather than something inherited from a `?? []`.

The same rule now applies to `generateMetadata`, which had the identical bug
and would have put "Profile not found" in the page title and in every link
preview during an outage.

### Verified against the real thing

The database went down again during this phase (Cloudflare 522 from the
Supabase gateway). The production build was already running, so the fix was
observed on the real page rather than argued for: `/mofope` rendered **"This
profile didn't load"** with Try again, Back to profile, Back to the feed and a
reference digest. Before Phase 2, that same condition rendered "We couldn't
find that page."

Screenshot:
`…\scratchpad\shots-phase2\outage-mofope.png`

One hygiene change came out of watching the log during it. A gateway failure
answers with an entire HTML error page, and the unbounded `error.message` put
several kilobytes of Cloudflare markup into the server log per request.
Failures are now wrapped by `queryFailure`, which collapses whitespace and
caps the message at 300 characters. None of it ever reached the reader.

---

## 4. The migration

`supabase/migrations/20260907000001_profile_content_split.sql`, one file, one
transaction.

**The view.** `CREATE OR REPLACE VIEW public.profile_record_entries` with
`content_kind` appended last. Appending is the only edit `CREATE OR REPLACE`
accepts, and it is what keeps the grants, keeps every existing consumer's
column positions, and leaves no window where the view does not exist.
`security_invoker` and `security_barrier` both travel with it; grants are
restated rather than assumed.

**The function.** A second function, `get_public_profile_record_summary_v2`,
rather than a signature change to the deployed one. `CREATE OR REPLACE` cannot
widen a set-returning function's returned table, and dropping the deployed one
would break every client between this migration and the deploy that follows
it. This follows `replace_my_featured_posts_v2`, which the repo already uses
for exactly this seam. Both functions read the same view, so they cannot
disagree.

**The Debate branch is deliberately absent** from the view. Debate is being
removed by `20260906000003` and `20260906000004`, which apply before this
file; referencing `debate_arguments` here would fail wherever that work has
already landed. Where it has not, this drops a branch no application code
reads: `ProfileRecordEntryKind` is publication, response and research, so a
`'debate'` row was already discarded on arrival, and nothing anywhere reads
`debate_count`.

**Safety.** No `CREATE TABLE`, no `ALTER TABLE public.posts`, no `UPDATE` or
`INSERT`. No backfill: legacy rows classify through the resolver exactly as
they always have. All of this is asserted by
`lib/profileContentSplitMigration.test.ts`, since the repo has no local
migration runner.

---

## 5. View and RPC changes

### `public.profile_record_entries`

One column added, at the end:

```sql
public.effective_content_kind(
  authorship.type,
  authorship.content_kind
)::text AS content_kind
```

Nothing branches on `posts.type` directly. The resolver is the same function
the `posts` title constraint uses, so `blog` resolves to `post`, `essay` and
`policy_brief` to `article`, and `research` to `research`, in the database and
in the application by the same rule.

`entry_kind` is untouched and stays what it was. The two are orthogonal and
both are needed: `entry_kind` answers "what relationship does this work have
to the conversation", `content_kind` answers "what format is it". A response
is usually a post and occasionally an article, and the profile has to be able
to say so.

### `public.get_public_profile_record_summary_v2(uuid, boolean)`

Returns everything v1 returned, plus:

```sql
count(*) FILTER (WHERE entry_kind = 'publication' AND content_kind = 'article')
count(*) FILTER (WHERE entry_kind = 'publication' AND content_kind = 'post')
```

The split counts publications only, which gives an exact invariant to check
against with research excluded:

```
article_count + post_count = publication_count
```

Responses stay in `response_count` and are not double counted; research keeps
its own bucket. `SECURITY INVOKER`, `SET search_path = ''`, grants restated.

v1 is untouched and still answers.

---

## 6. Deployment order and gating

**No new environment flag.** The audit proposed
`isProfileContentSplitEnabled()`. It is not needed, and a flag would have been
the worse mechanism: it has to be set by hand in every environment, and it
survives long after the migration it was protecting.

The invariant "OLD DB + NEW APP must not turn every profile into an error" is
held by the migration being additive and by one fallback in the application:

```
get_public_profile_record_summary_v2   →  PGRST202 "no such function"
                                       →  get_public_profile_record_summary
```

so an application deployed ahead of the migration renders the profile
normally and simply reports the split as unknown.

`articleCount` and `postCount` are therefore `number | null`, and null is not
zero. A surface that printed "0 articles" because a migration had not been
applied would be making a claim about the author that the database never made.
Phase 3 renders the split only when it is known.

**Deployment order, either way round:**

| Order | Result |
|---|---|
| Migration first, then app | v2 answers immediately. No fallback ever fires. |
| App first, then migration | Fallback fires until the migration lands, then stops on its own. The split is absent, nothing else is. |

Nothing has to be switched on. The fallback deletes itself the day v1 is
dropped, which is a later migration once no deployed client calls it.

The **view's** new column is not selected by any Phase 2 application code, so
that half needs no seam at all. Phase 3 will select it, and by then this is
deployed.

### The three release gates

Production state was supplied for this phase and is now recorded in
`lib/featureFlags.ts`:

| Gate | Production | Decision |
|---|---|---|
| `isProfilePositioningEnabled` | Column PRESENT | **Kept.** Production being ahead is not the same as every environment being ahead: a preview branch or a developer's database can still lag, and PostgREST rejects the whole select over one unknown column. There is no way from here to verify every environment, so the condition for deleting it is not met. Documented as confirmed. |
| `isFeaturedWorkNotesEnabled` | Column PRESENT | **Kept**, same reasoning, same note. |
| `isCredibilityGraphEnabled` | Schema ABSENT | **Must stay off.** Now also irrelevant to the public profile, which no longer loads the graph at all. |

Note that the failure these gates guard against is no longer a 404 either way.
The loader now separates a failed query from a missing row, so a gate slipping
would produce a retryable error rather than a page claiming the person does
not exist.

---

## 7. `lib/profileViewData.ts`

```
loadProfileView({ supabase, username, view, page, includeResearch })
  ├─ wave 1  loadProfileIdentity + auth.getUser
  └─ wave 2  loadProfileViewerContext
             loadProfileOpportunityState
             loadProfileOverview        (view === "overview")
             loadProfilePublications    (view === "articles" | "posts")
```

Each piece is exported on its own, so Phase 3 can compose a view without going
through the orchestrator when it needs something narrower.

| Function | Loads |
|---|---|
| `loadProfileIdentity` | The profile row. Null for absent, throws for failed |
| `loadProfileViewerContext` | Follower and following counts, follow, subscription, block, message eligibility |
| `loadProfileOpportunityState` | Talent visibility, with the existing public / partners_only / owner rule |
| `loadProfileFeaturedWork` | The selection and the work behind it, in one round trip |
| `loadProfilePublications` | One page of Articles or of Posts |
| `loadProfileOverview` | Summary, record preview, featured, topics |

**The cost of a view is what that view shows.** About asks for no publication
list and no featured work; Articles asks for no featured work; only Overview
pays for the record preview. Asserted by tests, not just intended: the stub
client records which tables were touched.

`ProfilePublication` is the list shape Phase 3's rows will render.
`contentKind` and `articleFormat` on it are resolved through `contentModel`,
never read off the row. It carries one transitional field, `legacyType`,
documented as existing only for `FeaturedWork`, which Phase 3 redesigns.

---

## 8. Query waves

**Before:** five serial waves, roughly 19 round trips.

1. profile + session
2. summary, record preview, followers, following, talent, featured ids,
   follow, subscription, block, **researcher profile**
3. owned topic posts, co-authored topic posts, **featured posts** (needed the
   ids from wave 2)
4. **message eligibility**, awaited alone
5. **credibility graph**

**After:** two waves, roughly 13.

1. profile + session
2. everything else

What went, and why:

- **Message eligibility** moved into wave 2. It needs the viewer id and the
  profile id, both known before the wave opens, so awaiting it alone was a
  whole serial round trip for no reason.
- **Featured work** is one query. `profile_featured_posts.post_id` has a
  foreign key to `posts`, so PostgREST embeds the work directly; the
  ids-then-posts pair existed only because it had been written as two
  statements.
- **The researcher profile** is gone from this path.
- **The credibility graph** is gone from this path.

The remaining nesting is honest rather than accidental: the record preview
reads the record index and then hydrates the posts it named, which is two
steps because the index deliberately carries no content.

---

## 9. Research removed from the public profile

Removed from the profile path:

- the `researcher_profiles` query
- the Research background block passed into `ProfileBackground` (the component
  still accepts a `research` prop for the surfaces that have one; the public
  profile no longer passes it)
- `RESEARCH_TYPE_QUERY_EXCLUSION` from the profile's own queries
- the Research filter on featured work, which the active publishing formats
  already make unnecessary

**Not removed**, deliberately:

- `RESEARCH_TYPE_QUERY_EXCLUSION` itself. It is used by the feed, search,
  topics, the dashboard, the landing page, the sitemap, the daily brief,
  admin review, fellowships and the profile's own `actions.ts`. This is a
  profile-path cleanup, not a global deletion, and a test asserts the constant
  still exists for those callers.
- Any Research table, row or history.
- `/[username]/record`, which still classifies research entries and still
  works. No redirect.

---

## 10. Credibility removed from the public profile

`loadProfileCredibilityGraph` is no longer called by the public profile, and
`DemonstratedExpertise` and `ProfileRecognition` are no longer rendered by it.
The page was querying a graph in order to pass it into two sections the
product decision removed.

Production does not have that schema at all, so the profile was paying for
queries that could only ever return empty.

`lib/credibilityGraphData.ts` and both components are left in place, as
instructed. `loadProfileCredibilityGraph` now has no caller.

---

## 11. Topic scan

The scan was unbounded: every published post an author owned or co-authored,
fetched on every profile view, to rank a few tags. For a prolific author that
is thousands of rows to draw three words.

It is now bounded at **200 most recent works**, ordered by publication date,
with the co-authored branch bounded on acceptance order. That covers every
author on the platform today with room to spare, so nothing visible changes
now, and where it eventually binds it biases the list toward recent work,
which is the more useful answer to "what does this person write about" than an
all-time frequency count.

No stored counter, no topics table, and co-author semantics are untouched.

**The structural fix is identified and deliberately deferred**: aggregation in
SQL, a topics function grouping tags over `profile_record_entries` and
returning a dozen rows instead of a page of posts. It belongs with Phase 4's
Intellectual Footprint, which needs the same aggregate, and smuggling it into
a content-split migration would have made both harder to review. The same
future change retires `TOPIC_POST_ID_CAP`, the 300-id URL-length guard in the
record's topic filter.

---

## 12. Tests and checks

| Check | Result |
|---|---|
| `npm test` | **197 files, 2088 tests, all pass** |
| `npm run typecheck` | Pass, clean |
| `npm run lint` | Pass, clean, no warnings |
| `npm run build` | Pass, "Compiled successfully in 22.5s", all four profile routes compile |
| `npx vitest run lib/profile components/profile lib/contentModel.test.ts` | 30 files, 433 tests, all pass |

40 tests added. No unrelated failures: the working tree contains only Phase 2
changes (see section 16).

**Outage handling** (`lib/profileViewData.test.ts`) — null with no error
returns null; null with an error throws; a failed relationship count throws
rather than printing zero; `loadProfileView` propagates a failure instead of
reporting an absence.

**Content split** (`lib/profileViewData.test.ts`,
`lib/profileContentSplitMigration.test.ts`) — a modern article, a modern post,
a legacy essay, a legacy policy brief and a legacy blog all classify
correctly, including on the co-authored branch, which cannot be filtered by
PostgREST and therefore goes through the resolver in TypeScript. The generated
filter contains `type.in.(essay,policy_brief)` for Articles and
`type.in.(blog)` for Posts, both derived from the shared mapping.

**Counts** (`lib/profileRecord.test.ts`, `lib/profileRecordData.test.ts`) —
v2 rows produce the split and satisfy `article + post = publication`; v1 rows
leave it null; an explicit zero reads as zero; existing summary fields are
unchanged; the fallback fires on `PGRST202` and on the message form, and does
**not** fire on a real failure.

**Research and credibility removal**
(`lib/profileContentSplitMigration.test.ts`) — the profile path names neither
`researcher_profiles` nor the credibility loader, threads no `research` prop,
and does not touch `post_citation_edges` or `profile_recognitions` at runtime.
Comments are stripped before these assertions, so prose explaining a removed
query cannot pass for the query.

**Existing states** — the 91 `ProfileHeader` tests covering owner, visitor,
anonymous, blocked and privacy behaviour pass unchanged.

Two pre-existing tests were updated to follow the code rather than the other
way round: `profileZeroStates` reads the record preview as a list now that it
arrives as one, and `profilePositioningStatement` looks for the gate in
`profileViewData.ts`, where the projection is built, plus a stricter new
assertion that the page names the column nowhere at all.

---

## 13. Migration deployment status

**Written, not applied. Deployment is pending.**

This environment has no linked Supabase project (no `supabase/config.toml`,
no project ref) and no local migration runner, and the instruction for this
phase was not to apply it. The Supabase project was additionally unreachable
for part of the phase (Cloudflare 522), so it could not have been verified
even had applying been in scope.

Nothing was applied and nothing was written to any database.

To deploy: apply `20260907000001_profile_content_split.sql` after
`20260906000004_remove_debate_schema.sql`, then run the verification queries
in the file's footer. The application can ship before or after it.

---

## 14. Warnings and open items

- **`loadProfileCredibilityGraph` now has no caller.** Left in place as
  instructed. It should be deleted with the rest of the credibility
  infrastructure, or given a consumer, rather than lingering.
- **The `legacyType` field on `ProfilePublication`** exists only so
  `FeaturedWork` keeps working. It goes when Phase 3 redesigns that component.
- **`npm run build` retried `/(marketing)/landing`** twice on the 60-second
  prerender timeout before succeeding. That page fetches data at build time
  and the database was slow. Pre-existing, unrelated to this phase, and it
  succeeded.
- **The topic scan bound is a compromise**, not a fix. See section 11.
- **The Article/Post split counts publications only.** A response that is a
  post is counted by `response_count`, not by `post_count`. That is the
  invariant the counts are built on and Phase 3 should render it as such.
- **`get_public_profile_record_summary` (v1) is now redundant** once the
  migration is everywhere. Dropping it is a later migration, not this one.

---

## 15. `git diff --stat`

The working tree contains **only Phase 2 changes**. The concurrent
debate-removal and broadcast work, along with Phase 1 and Phase 1.5, was
committed as `71e5605` between the last report and this one, so there is
nothing to disentangle this time and nothing was staged, reset, stashed or
cleaned by this phase.

```
 app/(main)/[username]/page.tsx          | 411 +++++++-------------------------
 lib/contentModel.ts                     |  14 ++
 lib/featureFlags.ts                     |  24 +-
 lib/profilePositioningStatement.test.ts |  20 +-
 lib/profileRecord.test.ts               |  43 ++++
 lib/profileRecord.ts                    |  34 +++
 lib/profileRecordData.ts                |  99 +++++++-
 lib/profileZeroStates.test.ts           |   7 +-
 tsconfig.check.json                     |   6 +-
 9 files changed, 311 insertions(+), 347 deletions(-)
```

Untracked, all Phase 2:

```
?? lib/profileContentSplitMigration.test.ts
?? lib/profileRecordData.test.ts
?? lib/profileViewData.test.ts
?? lib/profileViewData.ts
?? supabase/migrations/20260907000001_profile_content_split.sql
```

`page.tsx` loses 411 lines and gains far fewer because the query plan moved
into the loader. The page is now a render.

---

## 16. `git status`

Nothing staged. Nine modified, five untracked, on `main`, at `71e5605`.

Every entry belongs to this phase. There is no pre-existing staged change set
and no unrelated concurrent change left in the tree.

---

## 17. Phase 3

**Not started.** No Overview, Articles, Posts or About tab. No `ProfileTabs`,
no tab parser, no Selected Work redesign, no `ThoughtCard`, no `ArticleRow`,
no Intellectual Footprint, no right rail, no links schema, no engagement
actions.

`/[username]/record` still works and is not redirected.
