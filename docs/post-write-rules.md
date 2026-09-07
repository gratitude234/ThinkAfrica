# Post write rules, and the three production does not have

Where the rules `guard_locked_post_write()` enforces now live, and a decision
note on the three checks that exist in the repository but not in the database.

## The layer

`lib/postPolicy.ts` is a pure module: no I/O, no Supabase import. It takes a
snapshot of the row as it currently is, the actor the server resolved, and what
is being asked, and returns a decision. `lib/postMutations.ts` runs the
pipeline around it:

```
viewer identity -> load post -> policy -> statement with predicates -> row count
```

The last step is the one that replaces RLS. On Neon a policy denies by matching
nothing, and a matched-nothing UPDATE is indistinguishable from a successful
one unless somebody looks at the count.

## Why the trigger is not enough

```sql
IF auth.role() IS DISTINCT FROM 'authenticated'
   OR current_user IS DISTINCT FROM 'authenticated' THEN
  RETURN COALESCE(NEW, OLD);
END IF;
```

Off Supabase there is no role called `authenticated`. The application connects
as `indegenius_app`, the second disjunct is always true, and the trigger
returns before evaluating anything.

This does not fail closed. RLS compares against a NULL `auth.uid()` and denies;
this bypass is an inequality, and an unrecognised role satisfies it. Proven, not
assumed: `lib/postPolicy.neon.test.ts` issues all eight forbidden statements
against Neon and asserts Postgres **accepts** every one, then asserts the policy
refuses every one.

The trigger stays as a Supabase-side backstop. Nothing depends on it.

## The rule matrix

`op` is the operation; `actor` is the resolved viewer. LIVE means the deployed
trigger enforces it today.

| # | Operation | Post state | Requested | Actor | Result | Reason | Class |
|---|---|---|---|---|---|---|---|
| 1 | UPDATE | any | `status = published` on research/policy_brief | author | **deny** | publication is an editorial act | LIVE |
| 2 | INSERT/UPDATE | any | set/clear/replace `citation_id` | author, editor | **deny** | evidence of completed review | LIVE |
| 3 | INSERT/UPDATE | any | set/clear/replace `published_version_id` | author, editor | **deny** | same | LIVE |
| 4 | UPDATE | `published` + research/policy_brief | anything | author | **deny** | locked so the citation record is stable | LIVE |
| 5 | DELETE | not `draft` | delete | author | **deny** | withdraw instead; keeps the editorial record | LIVE |
| 6 | UPDATE | `withdrawn` | anything | author, editor, admin | **deny** | resurrection re-enters review with retired assignments | LIVE |
| 7 | UPDATE | any | `status = withdrawn` on non-editorial type | author | **deny** | nothing to withdraw from | LIVE |
| 8 | UPDATE | not `pending`/`pending_revision` | `status = withdrawn` | author | **deny** | only a live submission can be withdrawn | LIVE |
| 9 | UPDATE | `removed` | anything | author, editor, admin | **deny** | moderation is not edited around | LIVE |
| 10 | UPDATE | any | `status = removed` | author, editor | **deny** | moderation is an admin act | LIVE (via role) |
| 11 | UPDATE | any | any transition not in the table | any | **deny** | closed state machine | NEW (application) |
| 12 | UPDATE | any | write a column outside the author allowlist | author | **deny** | default-deny protected fields | NEW (application) |
| 13 | UPDATE | any | any, by a non-owner without a role | any | **deny** | ownership | NEW (application) |
| 14 | UPDATE/DELETE | any | anything, when the row moved since it was read | any | **deny** | affected-row check | NEW (application) |
| R1 | UPDATE | `pending`/`pending_revision` + editorial | change type/content_kind/article_format | author | deny | classification frozen in review | **REPO-ONLY** |
| R2 | UPDATE | `pending` + editorial | `status` <> `pending` | author | deny | only the editorial workflow moves it | **REPO-ONLY** |
| R3 | UPDATE | `pending_revision` + editorial | `status` not in (`pending_revision`,`pending`) | author | deny | stay in revision or resubmit | **REPO-ONLY** |

Rows 11 to 14 are marked NEW because the trigger never had them: a trigger sees
one row and one statement, so it cannot express "this actor may not perform
this transition" or "this write matched nothing". They are not new *product*
rules; they are the same rules stated where they can actually be enforced.

Rows 1 to 10 are ported from the definition read out of `pg_catalog`, not from
`supabase/migrations/`. The live trigger matches neither file in the repository.

## The three repo-only rules

`supabase/migrations/20260720000001_lock_accepted_and_removed_posts.sql`
defines R1, R2 and R3. The live database does not have them, and a
catalogue-wide search finds their text in no other function, so they were not
relocated. `lib/contentModel.test.ts` also models them, which means the test
suite has been asserting behaviour production does not have.

They are implemented in `lib/postPolicy.ts` behind `REPO_POLICY` and are **off
by default**. `LIVE_POLICY` reproduces production exactly.

### What production permits today

An author whose research paper or policy brief is sitting in `pending` or
`pending_revision` can, with a direct authenticated write:

- change its `type`, `content_kind` or `article_format`
- move its status anywhere the other nine rules do not block

The other nine still apply, so this is narrower than it sounds. They cannot
publish it (rule 1), cannot touch the citation evidence (2, 3), cannot delete it
(5), and cannot withdraw it except from a live submission state (7, 8). What is
genuinely open is reclassification during review, and status moves within the
subset the remaining rules allow.

### What the repository intended

Freeze the classification for the whole time a submission sits in review, and
restrict its status moves to the author-legitimate subset (stay, or resubmit).
The migration's own comment gives the reason: the self-publish check inspects
only the *resulting* classification, so a single UPDATE that reclassifies a
pending research row away from research **and** sets `status = 'published'` in
the same statement slipped past it.

That specific hole does not exist in this application layer. `checkTransition`
evaluates `requiresEditorialPublication` against the requested classification as
well as the stored one, so the combined statement is refused by rule 1 whether
or not R1 is active. `lib/postPolicy.test.ts` pins it.

### Does any flow depend on the looser behaviour?

**No.** Checked three ways:

1. **The edit flow does not accept classification from the client.**
   `app/(main)/edit/[slug]/actions.ts` derives `type`, `content_kind` and
   `article_format` from the freshly-fetched row via `resolveContentKind()` and
   `resolveArticleFormat()`. There is no client-supplied classification to
   change.
2. **The normalisation those resolvers perform is a no-op on real data.** They
   could in principle rewrite a NULL into a derived value, which R1 would read
   as a classification change. Production currently holds **zero** posts with a
   NULL `content_kind`, and for a research row `resolveArticleFormat()` returns
   null because the content kind is not `article`. So the values written back
   are identical to the values stored.
3. **The status moves those flows perform are already inside R2 and R3.** The
   edit flow computes `nextStatus = status === "pending_revision" ? "pending" :
   status`, which is exactly "stay, or resubmit". The research submission flow
   restricts editing to `draft` and `pending_revision` before it starts.

There is **one** post in `pending` across the whole table, `type=research`,
`content_kind=research`, `article_format=null`. Activating R1, R2 and R3 would
change nothing about it.

### Recommendation

**Activate them, in a separate migration, after this layer is wired into the
call sites.** Not now, and not in the same change.

The reasoning:

- They close a real gap. Reclassification during review is not something any
  flow does, which means permitting it buys nothing and costs the review record
  its meaning.
- They are free right now. One post is in review and it is unaffected. This is
  the cheapest this change will ever be.
- But they are still a production behaviour change, and bundling one into a
  migration whose purpose is "move the rules into the application without
  changing them" is how a regression gets attributed to the wrong commit. The
  port should be provably behaviour-preserving first.

Turning them on is one line: pass `REPO_POLICY` instead of `LIVE_POLICY`. The
tests for both already exist.

**No decision is needed from you to proceed**, because activating them changes
no user-visible workflow. The decision is only about when.

## What is not covered here

The trigger is one of ten on `public.posts`. This layer replaces that one. The
other nine (`posts_sync_content_classification`, `posts_seed_aggregate_counts`,
`posts_touch_updated_at`, and so on) are derivation and bookkeeping rather than
authorization, and they run on Neon exactly as they do on Supabase because none
of them consults a role.
