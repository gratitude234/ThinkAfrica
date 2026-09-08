# The dashboard's two known semantic defects

Both were found while migrating the dashboard off PostgREST. Neither is caused
by the migration, and they are recorded separately because they need different
treatment at cutover: **one has been fixed, one has deliberately not been.**

A parity harness comparing the two transports must know which is which, or it
will report the fix as a difference and the preserved bug as agreement.

---

## 1. `fellowship_applications.reviewed_at` — FIXED

**Legacy behaviour.** The dashboard's PostgREST select named
`reviewed_at`, which does not exist on `fellowship_applications`. The
production catalogue shows eight columns and no equivalent:

```
id, fellowship_id, user_id, cover_letter, status, applied_at,
proof_post_id, review_note
```

PostgREST rejects a select naming an unknown column with a 400, whole. The
caller destructured `{ data: applicationsRaw }` and dropped `error`, so
`applicationsRaw` was `null`, `applications` was `[]`, and the applications
list has been silently empty for as long as the line has existed. Nothing
logged. Nothing rendered wrong.

**Intended fixed behaviour.** The column is removed from the select on both
backends. The query now succeeds and returns the applications a member has
actually made.

**Why it could not be preserved.** A direct connection raises `column ... does
not exist` rather than returning nothing, so carrying the bug forward would
turn a quiet blank into a broken page. There was no correct replacement field
to substitute: nothing on the table records when an application was reviewed.

**Error handling.** The repository's `rows()` helper throws on a query failure
rather than returning `[]`. An empty list and a failed query are no longer the
same answer.

**Parity expectation.** `PostgREST(old) != PostgreSQL(new)` **by design**. A
harness must not compare this read against the pre-fix behaviour. Both
transports now run the corrected select, so post-fix they agree with each
other; what they no longer agree with is production before this change.

**Guarded by.** `lib/db/columnContract.test.ts`, which checks every column
named in a PostgREST select against the production catalogue. It would have
caught this, and it is the general form of the same defect the project already
documents for `positioning_statement`.

---

## 2. The bookmark stat counts the viewer's own bookmarks — NOT FIXED

**Current behaviour.** The dashboard shows a "bookmarks" number per post. The
query is

```
from("bookmarks").select("post_id").in("post_id", myPostIds)
```

and the `bookmarks` policy is `USING (auth.uid() = user_id)`, for every
command. So the number is *how many of my own posts I have bookmarked myself*,
not how many people saved my work. On most dashboards it is zero.

**Why it has not been changed.** Changing it is a product decision, not a
migration one. The number is presented to authors as a measure of reach; making
it mean what it appears to mean would change what every member sees, and that
belongs to whoever owns the dashboard rather than to a refactor.

**Parity expectation.** `PostgREST == PostgreSQL`, exactly. The PostgreSQL
repository reproduces the policy with `b.user_id = $viewer` so the two agree.
A harness comparing them through the service role would see *more* rows on the
PostgREST side, because the service role has no policy; that is the harness
being wrong, not the code.

**Guarded by.** `lib/db/dashboard.neon.test.ts`, "scopes the bookmark stat to
the viewer, as the policy always did", which asserts that another member's
dashboard cannot learn the bookmark exists. If someone later decides to change
the semantics, that test is the thing that says the current behaviour was
chosen rather than inherited.

**Follow-up, if it is ever wanted.** The count an author probably expects is
`select count(*) from bookmarks where post_id = ...` read through a
service-role or `SECURITY DEFINER` path, since a member cannot be allowed to
read other people's bookmark rows directly. That is a new aggregate, not a
filter change.

---

## 3. A third, smaller one, for completeness — NOT FIXED

The dashboard runs its fellowship and talent queries on every load, although
`FEATURE_FLAGS.fellowshipsSection` and `FEATURE_FLAGS.talentMarketplace` are
both `false` and the sections render nothing. Six round trips per dashboard
view, for markup that is never produced.

Left running, exactly as before. Removing them is safe and is a small
performance change rather than a semantic one, but it is still a change, and
this sprint's job was to move the transport without moving anything else.
