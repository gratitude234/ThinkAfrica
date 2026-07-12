# Write System Audit — Indegenius

Investigation only. No code was changed. This documents the current writing, drafting, submission, review, and citation pipeline as of 2026-07-12 (`main`, commit `5c92093`).

---

## 1. Editor

### 1.1 Where it lives

| File | Role |
|---|---|
| [components/editor/Editor.tsx](components/editor/Editor.tsx) | The Tiptap-based rich text editor. Client component (`"use client"`), lazy-loaded via `next/dynamic` with `ssr: false` from [app/(main)/write/page.tsx:29](app/(main)/write/page.tsx#L29). |
| [app/(main)/write/page.tsx](app/(main)/write/page.tsx) | The `/write` route. Owns all editable field state (title, subtitle, excerpt, tags, content, cover image, references, co-authors), format switching, response-to-post context, and orchestrates autosave + publish. |
| [app/(main)/write/DraftManager.tsx](app/(main)/write/DraftManager.tsx) | `useDraftManager()` hook — debounced Supabase autosave, `localStorage` crash-recovery backup, draft loading by `?draft=<id>` query param. |
| [app/(main)/write/PublishDrawer.tsx](app/(main)/write/PublishDrawer.tsx) | The publish-time side panel: format picker, tags, quality checklist, cover image, custom slug, co-authors, references. Calls `publishPost()`. |
| [app/(main)/write/writeConfig.ts](app/(main)/write/writeConfig.ts) | Static config: `WRITE_FORMATS` (per-type word minimums/labels), `STARTER_TEMPLATES`, response-intent starter copy. |
| [app/(main)/write/writeUtils.ts](app/(main)/write/writeUtils.ts) | Subtitle-in-content encoding (`composeContentWithSubtitle` / `extractSubtitleFromContent`), `inferTypeFromContent()` (word-count/heading heuristic used to suggest a format). |
| [app/(main)/write/WriteReadinessPanel.tsx](app/(main)/write/WriteReadinessPanel.tsx) | Sidebar/mobile-sheet readiness summary (word count, missing fields) shown while writing, before the publish drawer opens. |
| [app/(main)/write/MyDrafts.tsx](app/(main)/write/MyDrafts.tsx) | Draft-switcher list, queries `posts` where `status = 'draft'` for the current user. |
| [app/(main)/write/ContinueDraftBanner.tsx](app/(main)/write/ContinueDraftBanner.tsx), [DraftSignalPreview.tsx](app/(main)/write/DraftSignalPreview.tsx), [draftCoaching.ts](app/(main)/write/draftCoaching.ts) | Supporting UI/copy for nudging draft completion. Not read in depth for this audit. |
| [app/(main)/write/actions.ts](app/(main)/write/actions.ts) | Server actions: `ensureDraft`, `savePostReferences`, `publishPost`. |
| [app/(main)/edit/[slug]/](app/(main)/edit/%5Bslug%5D/) | Post-publish editing (non-research): `actions.ts` (`saveEditedPost`), `EditForm.tsx`, `page.tsx`. |
| [app/(main)/submit/research/](app/(main)/submit/research/) | A **separate, parallel** flow for `type = 'research'` — does not use `components/editor/Editor.tsx` at all (see §3.3). |

### 1.2 State it manages

`Editor.tsx` is a controlled component with a `forwardRef` handle (`EditorHandle`) exposing `toggleBold/Italic/H2/BulletList/Blockquote`, `isActive`, `undo/redo`, `triggerImageUpload`, `insertLink` — used by both the desktop floating toolbar and a separate mobile bottom toolbar in `WritePage`.

Internal editor state:
- `rawWordCount` / `displayWordCount` — word count is debounced 300ms before being shown, to avoid the count jittering while typing fast.
- `saveStatus: "saved" | "saving" | "unsaved"` — **local, editor-only** save indicator. It fires `onAutoSave` 2000ms after the last `onUpdate`, independent of the draft-level autosave in `DraftManager.tsx` (see §2.1 for the double-debounce issue this creates).
- `localReferences` — synced from the `references` prop via `useEffect`; the References panel (for `research`/`policy_brief`) lives *inside* the editor component itself, not a separate form section, though `PublishDrawer.tsx` also renders its own independent references editor (§5 callout).

All higher-level state (title, subtitle, tags, cover image, post type, co-authors, in-response-to) lives in `WritePage`, not in the editor.

### 1.3 Rich text handling

- **Library**: Tiptap (`@tiptap/react`, `@tiptap/starter-kit`) with extensions: `Placeholder`, `CharacterCount`, `Image` (`allowBase64: false`, uploads go through `/api/upload-image`), `Link` (`openOnClick: false`, forces `rel="noopener noreferrer" target="_blank"` on non-hash links).
- **Storage format**: **Sanitized HTML**, stored directly in `posts.content` (and snapshotted into `post_versions.content`). Not Markdown, not Tiptap/ProseMirror JSON.
- **Sanitization**: [lib/sanitizePostHtml.ts](lib/sanitizePostHtml.ts) runs `sanitize-html` server-side on every write path (`ensureDraft`, `publishPost`, `saveEditedPost`, `createVersionSnapshot`, and research's `buildResearchContent`). Allowed tags = `sanitize-html` defaults + `h1/h2/h3/img/s/span/sub/sup/u`. Anchors keep only `href` (forced `target=_blank`/`rel` for non-`#` links); images keep only `alt/src/title` and only `https` scheme. It also strips a leftover `Body:` label artifact from older content via regex (`removeDraftSectionLabels`) — a sign of a prior content format that's being cleaned up post hoc.
- **Subtitle encoding**: There is no dedicated `subtitle` column on `posts`. The subtitle is encoded as the *first* HTML fragment: `<p data-subtitle="true" class="lead ta-subtitle">…</p>`, prepended to `content` by `composeContentWithSubtitle()` and stripped back out by `extractSubtitleFromContent()` when a draft is reloaded. This is a fragile convention — any code path that touches `content` without knowing this convention (e.g. a future migration script, or the research flow which calls `buildResearchContent()` directly) will not extract/preserve it correctly. Flagged in §7.
- **Word counts**: Computed client-side by stripping tags via `content.replace(/<[^>]*>/g, " ")` in *three different places* with near-identical regex (`Editor.tsx:countWordsFromHtml`, `write/page.tsx:countWords`, `lib/postQuality.ts:countWords`), rather than one shared helper. See §7.

---

## 2. Draft Lifecycle

### 2.1 Creation, saving, retrieval

Two **independent, parallel autosave implementations** exist for the same `posts` row, both writing directly to Supabase from the client (not through a server action):

1. **`DraftManager.tsx` (`useDraftManager`)** — the "real" persistence path used by `write/page.tsx`. On every field change, `saveDraft(data)` is called, which:
   - Stores the payload in `latestDataRef` immediately.
   - Debounces 3000ms (`AUTOSAVE_DELAY`), then upserts to `posts` (insert if no `draftId` yet, else `update ... where id = draftId and author_id = user.id`).
   - Separately, every 5000ms (`LS_INTERVAL`), whatever is in `latestDataRef` is also written to `localStorage` under `indegenius_draft_backup` — a **crash-recovery backup independent of the DB save**, restored on next visit to `/write` with no `?draft=` param if it has content (`localBackup` state, "We found an unsaved draft" banner).
   - Legacy-key migration: reads `thinkafrica_draft_backup` (pre-rebrand key) if the new key is empty, copies it forward, but **never deletes the legacy key** — a deliberate, documented choice (comment: "never deleted outright, only replaced"), so it lingers in every returning user's `localStorage` indefinitely.
   - On first successful insert, calls `router.replace("/write?draft=" + id)` and fires a `draft_started` activation event.

2. **`Editor.tsx`'s own `onAutoSave`** — a *second*, independent 2000ms debounce inside the editor component, wired to call `saveDraft(getCurrentData())` again (from `write/page.tsx`'s `onAutoSave` prop) plus `savePostReferences()`. This means editing text triggers two overlapping debounce timers (2s editor-level, 3s draft-manager-level) that both ultimately call the same `saveDraft`, and the editor's own `saveStatus` ("Saving…"/"Saved") is a separate, desynced indicator from `DraftManager`'s `saveStatus` shown in the page header. See §7.

**Retrieval**: `DraftManager` loads a draft by reading `posts` directly (`select id,title,excerpt,content,tags,type,cover_image_url,in_response_to where id=:id and status='draft'`) — scoped to `status='draft'` only, so navigating to `/write?draft=<id>` for an already-submitted/published post silently shows nothing (`initialData` stays null) rather than an explicit error.

Client-side Supabase calls (both `DraftManager` and the editor's `onAutoSave`) rely entirely on RLS (`auth.uid() = author_id`) for authorization — there is no server action guarding autosave writes, unlike the `ensureDraft`/`publishPost` server actions which explicitly check `.eq("author_id", user.id)` as well.

### 2.2 Explicit draft creation path (`ensureDraft`)

Used once, right before opening the Publish drawer, if a draft hasn't been created by autosave yet (`handleReadyToPublish` in `write/page.tsx`). Slugs are generated but not final — `publishPost` recomputes/overwrites the slug at publish time from title or custom slug. `ensureDraft` does not set `current_round` or touch `post_authors`/`post_references` beyond letting `savePostReferences` run afterward if references exist.

### 2.3 Status field logic

`posts.status` values in use (see full check-constraint history in §4.1):

```
draft → pending → published
              ↘ pending_revision → pending (resubmit) → published
              ↘ rejected
(published →) removed   [moderation-only, outside editorial workflow]
```

- **`draft`**: default on insert. Editable freely by the author via autosave or `ensureDraft`.
- **`pending`**: set by `publishPost()` for `research`/`policy_brief` ("Submit for Editorial Review" in the UI) or by `submitResearchPaper()`. For `blog`/`essay`, `publishPost()` sets status straight to **`published`** — these types skip the editorial workflow entirely and publish instantly (see `requiresEditorialWorkflow()` — only `research` and `policy_brief` return true).
- **`pending_revision`**: set by an editor's `request_revision` decision ([app/(main)/admin/review/actions.ts:379](<app/(main)/admin/review/actions.ts#L379>)), with a `revision_due_at` 14 days out. Author resubmits via `saveEditedPost` (non-research) or `submitResearchPaper` (research), which bumps `current_round` and flips status back to `pending`.
- **`published`**: set either directly (`blog`/`essay` at publish time) or via `publishReviewedPost()` after an editor `accept` decision (research/policy_brief), which also stamps `citation_id` and `published_version_id`.
- **`rejected`**: terminal, set by editor `reject` decision. `publishPost()` explicitly blocks republishing a post whose status is `removed` (moderation takedown) but does **not** check for `rejected` — a rejected post's owner can still resubmit it through the normal edit/publish path, effectively bypassing the rejection (see §7).
- **`removed`**: a moderation-only state (Trust & Safety v1, [20260704000001_trust_safety_v1.sql](supabase/migrations/20260704000001_trust_safety_v1.sql)), outside the editorial state machine. All public read paths filter `status = 'published'`, so removed posts vanish from feeds; authors can still see their own.

State machine logic itself lives in [lib/reviewWorkflow.ts](lib/reviewWorkflow.ts) (`requiresEditorialWorkflow`, `getEditorialReviewState`, `createVersionSnapshot`, `publishReviewedPost`, `recordEditorDecision`) — there is no DB-level state machine/trigger enforcing valid transitions; it's enforced entirely in application code across three different server-action files (`write/actions.ts`, `edit/[slug]/actions.ts`, `submit/research/actions.ts`, `admin/review/actions.ts`).

---

## 3. Submission flow

### 3.1 Standard publish (`blog` / `essay` / `policy_brief`) — `publishPost()` in [app/(main)/write/actions.ts](app/(main)/write/actions.ts)

Entry point: `PublishDrawer.handlePublish()` → `publishPost(input)`.

Client-side pre-flight checks (in `PublishDrawer`, before the server call):
- Title non-empty and not a low-quality placeholder (`isLowQualityTitle` — rejects empty, <4 chars, or matches `/^(untitled|hmmm+|test|draft|new post|asdf+|\.+)/i`).
- Custom slug, if provided, must not look like a pasted URL (`looksLikeUrl`).
- At least 1 tag, max 5.
- `qualitySummary.readyForSubmission` from [lib/postQuality.ts](lib/postQuality.ts) — all `blocking: true` checklist items done (title, tags, word-count-if-review-required, references-if-review-required).

Server-side (`publishPost`), re-validates independently (never trusts the client):
1. Auth required.
2. Not suspended (`requireNotSuspended`).
3. **Rejects `postType === "research"` outright** — "Research papers must be uploaded through the research submission flow." Research can never be published through this action.
4. Low-quality title check repeated server-side.
5. `getSubmissionTrack(postType)` must exist in `submission_tracks`.
6. References validated via `validateReferences()` — every reference needs a title AND at least one of source/url/doi/raw; `research`/`policy_brief` need ≥1 reference.
7. Custom slug URL-shape check repeated server-side.
8. If updating an existing draft/post: blocks republishing if `status = 'removed'`.
9. Computes final slug (`slugify(customSlug)` or `buildSlugFromTitle(title, "post", timestamp-suffix)` — **not checked for collisions**; relies on the `posts.slug` unique constraint to throw on collision, which is not specifically caught/reported as a friendly error).
10. Sets `status` = `published` (blog/essay) or `pending` (policy_brief), `current_round = 1`, `published_at` accordingly.
11. Upserts `post_authors` (owner + up to 5 deduped co-authors; new co-authors get a `co_author_invite` notification + email + `coauthor_invite_sent` activation event) and `post_references`.
12. If `requiresEditorialWorkflow(postType)` (i.e. `policy_brief`) and no `post_versions` row exists yet, snapshots a `submission`-kind version via `createVersionSnapshot()`.
13. Revalidates `/dashboard`, `/post/[slug]`, `/`, `/admin/review`, and the response-parent path if applicable.
14. If published immediately, fires-and-forgets a POST to `/api/audio-summary` (internal-secret-protected) to generate an audio summary — errors swallowed ("best-effort").
15. Records a `post_submitted` activation event.
16. If this is a response to another post, notifies + emails that post's author (unless self-response).

### 3.2 Post-publish edits (non-research) — `saveEditedPost()` in [app/(main)/edit/[slug]/actions.ts](app/(main)/edit/%5Bslug%5D/actions.ts)

- Blocks editing if `post.type === 'research'` (must go through `/submit/research`).
- **Blocks editing entirely if `status === 'published' && requiresEditorialWorkflow(type)`** — i.e. a published `policy_brief` is permanently locked to keep its citation record stable. (`blog`/`essay`, which never carry a citation, remain editable after publish.)
- If resubmitting from `pending_revision`: requires a non-empty author note, bumps `current_round`, flips status to `pending`, and snapshots a `revision`-kind version.
- Re-runs the same reference validation as `publishPost`.

### 3.3 Research submission — a separate, parallel flow ([app/(main)/submit/research/actions.ts](app/(main)/submit/research/actions.ts))

Research has its **own page, its own form, and its own server actions** — it does not reuse `Editor.tsx`, `DraftManager.tsx`, or `PublishDrawer.tsx` at all:

- `saveResearchDraft()` / `submitResearchPaper()` (→ `upsertResearchPost(input, "draft" | "pending")`) — title, abstract (used as both `excerpt` and the sole body of `content`, via `buildResearchContent()` which just wraps the abstract in `<h2>Abstract</h2><p>…</p>` plus a submitted-document line — **the manuscript itself is never HTML content**, it's an uploaded PDF).
- `ensureResearchDraftForUpload()` — a *third* draft-creation path (distinct from `write/actions.ts:ensureDraft` and `DraftManager`'s own upsert), used specifically to get a `postId` to attach an uploaded PDF to before the rest of the form is filled in. Blocks new PDF uploads unless status is `draft` or `pending_revision`.
- PDF upload itself goes through [app/api/research-document/upload/route.ts](app/api/research-document/upload/route.ts): requires an existing `postId` of `type='research'` owned by the caller, status must be `draft`/`pending_revision`, rejects `.doc/.docx` by filename, magic-byte-sniffs for a real PDF (`%PDF-` header), 20MB cap, stores to the **private** `research-documents` Storage bucket at `research/<user_id>/<uuid>.pdf`, and writes `document_path/original_name/mime_type/size_bytes` onto `posts`. Retrieval is via [app/api/research-document/[postId]/route.ts](app/api/research-document/%5BpostId%5D/route.ts) (not audited in depth — presumably signed-URL/streamed given the bucket is private).
- Validation (`validateResearchPayload`): title, abstract, ≥1 tag always required; for submission (not draft): a `document_path` must exist and must be `application/pdf`; ≥1 structured reference; author note required if resubmitting from `pending_revision`.
- Submission snapshots a version the same way as the standard flow, via the shared `createVersionSnapshot()`.
- Notably, **research submissions never call `publishPost()`** and thus never hit the `blog`/`essay` instant-publish branch — `requires_review = true, min_reviewers = 2` in `submission_tracks` for `research` guarantees it always needs a full editorial cycle.
- Error messages here specifically translate raw Postgres errors mentioning `document_path`/`document_original_name`/`schema cache`/`column`/`research-documents` into a generic "Research document storage is not set up yet" message (`userSafeDatabaseError`) — a defensive shim against the possibility that the research-document migration hasn't been applied to a given environment yet.

### 3.4 Editorial decision → publish (research / policy_brief) — [app/(main)/admin/review/actions.ts](app/(main)/admin/review/actions.ts)

Reviewers (`role in ('reviewer','editor','admin')`) are assigned per-round via `assignReviewer()` (blocks assigning the author; notifies+emails the reviewer; on the *first* assignment of a round also notifies+emails the author "under review"). Reviewers submit a recommendation (`accept`/`revise`/`reject` + notes) via [app/(main)/review/actions.ts](app/(main)/review/actions.ts) `submitReview()` — a one-shot UPDATE guarded by `.is("recommendation", null)`, so a reviewer cannot silently overwrite an already-submitted recommendation through this action.

An editor calls `submitEditorialDecision({ postId, decision, notes })`:
- Requires `editorial.manage` admin-access scope (`lib/adminAccess.ts`, not read in depth).
- Recomputes readiness server-side via `getEditorialReviewState()` — errors out unless every assigned reviewer for the current round has submitted AND the assignment count meets `submission_tracks.min_reviewers`. The client's "ready" indicator in `admin/review/page.tsx` is informational only; the server re-derives it independently.
- `decision = "accept"` → `publishReviewedPost()` (for research/policy_brief) snapshots a `publication`-kind version, sets `status='published'`, `published_at`, `published_version_id`, and — **only if `citation_id` is still null** — calls `generate_citation_id()` (§4). Non-reviewed types would take a simpler direct-update branch, but in practice `submitEditorialDecision` is only reachable for posts already in the `pending`/`pending_revision` editorial queue, i.e. always `research`/`policy_brief`. Notifies+emails the author with the citation ID and a `/publication/[citationId]` link if available. Fires the same best-effort `/api/audio-summary` call as the direct-publish path.
- `decision = "request_revision"` → `pending_revision` + 14-day `revision_due_at`; notifies+emails author with a direct link back into the edit flow (`/submit/research?draft=<id>` for research, `/edit/<slug>` otherwise).
- `decision = "reject"` → `rejected`; notifies+emails author.
- Every branch writes an `editorial.decision_recorded` admin audit event (`lib/adminAccess.ts:recordAdminAuditEvent`) and calls `revalidateEditorialPaths()`.

---

## 4. Citations

### 4.1 ID generation and format

Format: **`IND-{year}-{4-digit-sequence}`**, e.g. `IND-2026-0003`. (Formerly `TAK-` — ThinkAfrica — before the Indegenius rebrand; see §4.4.)

Generation is **fully atomic and DB-side** as of [20260705000001_atomic_citation_ids.sql](supabase/migrations/20260705000001_atomic_citation_ids.sql), which replaced an earlier, buggy application-level implementation:

- `citation_sequences(year integer primary key, counter integer, updated_at)` — one counter row per calendar year.
- `generate_citation_id(p_year integer) returns text`, `security definer`, executable only by `service_role`:
  ```sql
  insert into citation_sequences (year, counter, updated_at) values (p_year, 1, now())
  on conflict (year) do update set counter = counter + 1, updated_at = now()
  returning counter into v_seq;
  return 'IND-' || p_year || '-' || lpad(v_seq::text, 4, '0');
  ```
  The single `INSERT … ON CONFLICT … RETURNING` statement row-locks the `(year)` row for its duration, so concurrent callers serialize rather than racing on a stale read — this is the fix for the documented prior bug (count-then-format was not atomic and wasn't year-scoped).
- Called from the app only via [lib/citationId.ts](lib/citationId.ts) `generateCitationId(supabase, year)`, which wraps the RPC call — and that in turn is only invoked from [lib/reviewWorkflow.ts](lib/reviewWorkflow.ts) `publishReviewedPost()`, using the **admin client** (matches the `service_role`-only grant).
- Idempotency: `publishReviewedPost()` only requests a new ID `if (!post.citation_id)` — re-running an accept decision (e.g. a retry) will not mint a second citation for the same post.
- Uniqueness: `posts.citation_id` carries a `unique` constraint (`posts_citation_id_key`) in addition to the atomic-counter guarantee — belt and suspenders.

### 4.2 Where citation data lives / how it links to published pieces

- `posts.citation_id text unique` — the live pointer on the current post row.
- `posts.published_version_id uuid → post_versions.id` — the specific accepted **version snapshot** that is permanently associated with that citation.
- [app/(main)/publication/[citationId]/page.tsx](app/(main)/publication/%5BcitationId%5D/) — the public citation-archive page. Looks up `posts` by `citation_id` + `status='published'`, then loads the `post_versions` row referenced by `published_version_id` and renders **that frozen snapshot** (title/excerpt/content/references/authors/document), not the live/current `posts` row. This is deliberate: if a `blog`/`essay`-type edit path were ever allowed on a cited post, the citation would still resolve to the accepted text. (Policy briefs are already hard-locked from editing post-publish per §3.2, but research isn't explicitly re-checked here — it structurally can't be edited post-publish since `saveEditedPost` rejects `type==='research'` and the research action `upsertResearchPost` doesn't special-case `published` status for content edits, only for PDF re-upload gating.)
- `post_versions.references` / `post_versions.authors` are **denormalized JSONB snapshots** (`jsonb`, default `'[]'`) of `post_references`/`post_authors` at snapshot time — captured by `createVersionSnapshot()` in `lib/reviewWorkflow.ts` via `getPostReferences()`/`getPostAuthors()`. For `version_kind='publication'` snapshots specifically, authors are filtered to `accepted_at IS NOT NULL` only (pending co-author invites don't appear in a published citation's author list).

### 4.3 Uniqueness / atomicity

Covered in §4.1 — atomic via row-locked upsert-and-increment RPC, plus a DB unique constraint as a second guarantee. RLS on `citation_sequences` only grants `select` to admins (`is_admin()`); writes only happen through the `security definer` function.

### 4.4 Rebrand history (informational, not actionable)

[20260707000002_citation_id_prefix_indegenius.sql](supabase/migrations/20260707000002_citation_id_prefix_indegenius.sql) changed the function to emit `IND-` instead of `TAK-`, explicitly preserving the shared per-year counter so numbering doesn't restart. [20260707000003_backfill_citation_id_prefix.sql](supabase/migrations/20260707000003_backfill_citation_id_prefix.sql) is a **manual-only** (not auto-applied) backfill of the 2 pre-existing `TAK-*` citation IDs to `IND-*`, hardcoded by row ID with a comment noting neither had been cited externally yet.

---

## 5. Points of integration

### 5.1 Peer-review system

Fully covered in §3.4. Summary of the coupling surface:
- `submission_tracks` (`post_type` PK) is the single source of truth for whether a type needs review (`requires_review`) and how many reviewers (`min_reviewers`) — read by `write/actions.ts:publishPost` (to look up the track — though the track's `requires_review` flag isn't actually branched on there; the type-based `requiresEditorialWorkflow()` helper is used instead, so `submission_tracks` and the hardcoded `REVIEWED_POST_TYPES = ["research", "policy_brief"]` constant in `lib/reviewWorkflow.ts` are **two separate sources of truth that must be kept in sync manually** — see §7), by `admin/review/page.tsx`, and by `lib/reviewWorkflow.ts:getEditorialReviewState`.
- `post_reviews` (assignment + recommendation) and `post_editor_decisions` (per-round final call) are both keyed on `(post_id, round)`, allowing full revision-round history.
- `post_versions` is the append-only audit trail across the whole lifecycle: `submission` (first pending), `revision` (each resubmit), `publication` (the accepted snapshot). `version_number` is a strictly incrementing per-post counter (`getNextVersionNumber`).
- Review completion pays out points directly via a DB trigger (`award_points_on_review_submission`, +5 to `profiles.points` on the `submitted_at` null→non-null transition of `post_reviews`), independent of application code — mirrors the existing `award_points_on_publish` trigger (blog +10, essay +20, policy_brief +30, research +50) and `award_points_on_like` (+2). These three trigger-based point sources plus badge-award triggers (`check_and_award_badges`: "First Post" on 1st published post, "Researcher"/"Policy Maker" on first of that type; `award_badges_on_points` variant for "Rising Star" at 100pts / "Thought Leader" at 500pts) are **entirely DB-side and invisible to the TypeScript codebase** — a change to point values or badge thresholds requires editing SQL migrations, not `lib/` code.

### 5.2 Author profiles / credentials

- `post_authors` is the co-authorship join table (`post_id, user_id, display_order, corresponding_author, invited_at, accepted_at`). A co-author is "pending" until `accepted_at` is set — but **nothing in the audited code sets `accepted_at` in response to an accept/decline action**; `syncAuthors()`/`syncAuthors` (both copies, in `write/actions.ts` and `submit/research/actions.ts`) only ever preserve an existing `accepted_at` or default the *owner's* row to "accepted now." The notification type `co_author_accepted`/`co_author_declined` exists in the `notifications` type check constraint, implying an accept/decline UI exists elsewhere in the codebase (not found under `app/(main)/write`, `edit`, or `submit`, and out of scope for this audit) — flagged in §7 as unverified.
- `lib/profileCredibility.ts` (`getProfileCredibilitySummary`) and `lib/editorialTrust.ts` (`getEditorialTrustSummary`) compute **read-only, derived display signals** for the admin review queue and public pages — profile completeness score, "strongest signal" (verification/university/etc.), review-round timeline. Neither writes to the DB; they're pure functions over query results already fetched by the calling page.
- `posts.citation_id` / `post_authors.accepted_at` / `profiles.points` / `user_badges` together are the durable "credential" record referenced by a profile page (not audited here) to show a user's publication/citation/badge history.
- Reference data (`post_references`) is user-entered free text (authors/title/year/source/url/doi/raw), not validated against any external identifier system (no DOI format check, no live URL check) beyond "at least one of source/url/doi/raw must be present."

### 5.3 Notifications and email

Every write/submit/review-adjacent state change inserts into `notifications` and, if that insert succeeds, best-effort sends a templated email via [lib/email.ts](lib/email.ts) `sendUserEmail()` (Resend-backed, `idempotencyKey`-guarded, respects a `preferenceKey` opt-out where specified — several call sites, e.g. `co_author_invite` and `response_post`, do **not** pass a `preferenceKey`, meaning those emails cannot be turned off by the recipient, unlike `email_published`-gated ones). Full trigger inventory:

| Event | Notification `type` | Emailed? | Preference-gated? |
|---|---|---|---|
| New co-author invited | `co_author_invite` | yes | no |
| Response post published | `response_post` | yes | `email_responses` |
| Reviewer assigned | `review_assigned` | yes | no |
| First reviewer assigned to a round (author-facing "under review") | `review_started` | yes | no |
| Editor accepts (publish) | `post_published` | yes | `email_published` |
| Editor requests revision | `revision_requested` | yes | `email_published` |
| Editor rejects | `post_rejected` | yes | `email_published` |

All of these are inserted with `read: false` and a `link` deep-linking back into the relevant page. Every email call is preceded by an `if (!notificationError)` guard — if the notification insert fails, the email is silently skipped too (no independent retry/fallback path).

Separately, `recordActivationEvent()` (from `lib/activationServer.ts`, server-side) and `trackActivationEvent()` (from `lib/activationEvents.ts`, client-side) fire analytics-only events (`draft_started`, `post_submitted`, `coauthor_invite_sent`, `publish_drawer_opened`, `quality_check_viewed`, `quality_check_completed`, `reference_added`) — these are onboarding/activation funnel telemetry, not user-facing notifications, and were not traced further in this audit.

### 5.4 Audio summary

Both `publishPost()` (instant-publish path) and `submitEditorialDecision()`'s accept branch fire an unawaited (`void fetch(...).catch(() => {})`) POST to `/api/audio-summary`, authenticated via a shared-secret header (`x-internal-secret: ADMIN_SECRET`) rather than a normal session — this duplicates the same fetch/payload-construction logic in two files rather than sharing a helper (§7).

---

## 6. Full schema reference

### 6.1 `posts`

Column list assembled from `supabase/schema.sql` + every migration that touched `posts` (chronological):

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `uuid_generate_v4()` |
| `author_id` | `uuid` FK → `profiles(id)` | `on delete cascade`, not null |
| `title` | `text` | not null |
| `slug` | `text` | unique, not null |
| `content` | `text` | sanitized HTML; subtitle is prepended as a marked `<p>` (§1.3) |
| `excerpt` | `text` | |
| `type` | `text` | not null; check ∈ `{blog, essay, research, policy_brief}` — **unchanged since base schema** |
| `status` | `text` | not null, default `'draft'`; check ∈ `{draft, pending, pending_revision, published, rejected, removed}` (final form, after journal_system + trust_safety_v1 migrations) |
| `tags` | `text[]` | default `'{}'` |
| `pdf_url` | `text` | **dead column** — present since base schema, superseded by `document_path` et al., grep finds zero references in application code (§7) |
| `view_count` | `integer` | default 0 |
| `impression_count` | `integer` | default 0 |
| `read_count` | `integer` | default 0 |
| `created_at` | `timestamptz` | default `now()` |
| `published_at` | `timestamptz` | nullable |
| `cover_image_url` | `text` | added phase5 |
| `current_round` | `integer` | default 1; added journal_system |
| `citation_id` | `text` | unique; added journal_system, format changed by later migrations (§4) |
| `revision_due_at` | `timestamptz` | added journal_system; set to now()+14d on revision request |
| `published_version_id` | `uuid` FK → `post_versions(id)` | `on delete set null`; added editorial_workflow_hardening |
| `in_response_to` | `uuid` FK → `posts(id)` | `on delete set null`; added response_posts |
| `audio_summary_url` | `text` | added audio_summaries; async, best-effort, nullable = not generated / failed |
| `featured` | `boolean` | default false; added add_featured_to_posts; admin-toggled, one-at-a-time (unfeature-all-then-feature-one pattern in `toggleFeaturedPost`) |
| `document_path` | `text` | added research_document_uploads; storage path in private `research-documents` bucket |
| `document_original_name` | `text` | " |
| `document_mime_type` | `text` | " (always `application/pdf` in practice) |
| `document_size_bytes` | `integer` | " |
| `updated_at` | `timestamptz` | added posts_updated_at; `not null default now()`, auto-touched by `touch_posts_updated_at()` trigger on every `UPDATE` |

Indexes of note: `posts_author_id_idx`, `posts_status_idx`, `posts_slug_idx`, `posts_published_reads_recency_idx` (partial, published only), `posts_citation_id_idx` (partial, non-null only), `posts_review_state_idx (status, type, current_round)`, `posts_research_document_idx` (partial: research + has document), `posts_in_response_to_idx` (partial: has parent + published), `posts_published_version_idx` (partial, non-null only), `idx_posts_featured` (partial, featured only).

### 6.2 `post_versions`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `post_id` | `uuid` FK → `posts(id)` | `on delete cascade` |
| `version_number` | `integer` | not null; unique per `(post_id, version_number)`; strictly incrementing |
| `round` | `integer` | default 1; added editorial_workflow_hardening |
| `version_kind` | `text` | default `'revision'`; check ∈ `{submission, revision, publication}` |
| `content` | `text` | not null; sanitized HTML snapshot |
| `title` | `text` | not null |
| `excerpt` | `text` | |
| `author_note` | `text` | required when resubmitting from `pending_revision` |
| `submitted_by` | `uuid` FK → `profiles(id)` | `on delete set null` |
| `references` | `jsonb` | default `'[]'`; denormalized snapshot of `post_references` at capture time |
| `authors` | `jsonb` | default `'[]'`; denormalized snapshot of `post_authors`; `publication`-kind snapshots filter to `accepted_at IS NOT NULL` |
| `created_at` | `timestamptz` | default `now()` |
| `document_path` / `document_original_name` / `document_mime_type` / `document_size_bytes` | as `posts` | added research_document_uploads; snapshots the manuscript file reference at capture time |

Snapshots are created exactly three times per post lifecycle (unless revised more than once): on first submission (`submission`), on each resubmission from `pending_revision` (`revision`), and on editor acceptance (`publication`). All go through the single shared `createVersionSnapshot()` in `lib/reviewWorkflow.ts` — good, no duplicated snapshot logic.

### 6.3 `post_references`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `post_id` | `uuid` FK → `posts(id)` | `on delete cascade` |
| `display_order` | `integer` | default 0 |
| `ref_type` | `text` | check ∈ `{journal, book, website, report, other}`, nullable (defaults to `'other'` in app code) |
| `authors` | `text` | free text |
| `title` | `text` | not null |
| `year` | `integer` | |
| `source` | `text` | |
| `url` | `text` | |
| `doi` | `text` | |
| `raw` | `text` | freeform fallback |

No structured author/DOI validation; "at least one of source/url/doi/raw" is the only cross-field rule, enforced identically (copy-pasted) in three server actions (`write/actions.ts`, `edit/[slug]/actions.ts`, `submit/research/actions.ts`) — see §7.

### 6.4 `post_authors`

| Column | Type | Notes |
|---|---|---|
| `post_id` | `uuid` FK → `posts(id)` | `on delete cascade`, part of composite PK |
| `user_id` | `uuid` FK → `profiles(id)` | part of composite PK |
| `display_order` | `integer` | default 0; owner is always 0 |
| `corresponding_author` | `boolean` | default false; **exactly one `true` row per post enforced by a partial unique index** `post_authors_one_corresponding_author_idx (post_id) where corresponding_author` |
| `invited_at` | `timestamptz` | default `now()` |
| `accepted_at` | `timestamptz` | nullable = pending invite; owner's row is auto-accepted on creation |

Max 5 co-authors enforced only in application code (`deduped.size < 5` in both `syncAuthors` implementations), not at the DB level.

### 6.5 `submission_tracks`

| Column | Type | Notes |
|---|---|---|
| `post_type` | `text` PK | |
| `requires_review` | `boolean` | default false |
| `min_reviewers` | `integer` | default 1 |
| `allow_revision` | `boolean` | default true (present in schema, **not read anywhere** in the audited app code — see §7) |
| `description` | `text` | shown in the admin review queue section header |

Seed data: `blog` (no review), `essay` (no review, `min_reviewers:1` — unused since `requires_review=false`), `research` (review required, 2 reviewers), `policy_brief` (review required, 1 reviewer).

### 6.6 `post_reviews`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `post_id` | `uuid` FK → `posts(id)` | cascade |
| `reviewer_id` | `uuid` FK → `profiles(id)` | |
| `round` | `integer` | default 1 |
| `recommendation` | `text` | check ∈ `{accept, revise, reject}`, nullable until submitted |
| `notes` | `text` | |
| `submitted_at` | `timestamptz` | nullable; null→non-null transition is the "review completed" signal (drives points trigger) |
| `assigned_at` | `timestamptz` | default `now()` |
| `removed_at` | `timestamptz` | added by a later migration (`20260705000003_reviewer_removal_and_review_started_notice.sql`, not read in full) — soft-delete for reviewer removal, filtered out (`is("removed_at", null)`) everywhere reviews are read |

Unique on `(post_id, reviewer_id, round)`.

### 6.7 `post_editor_decisions`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `post_id` | `uuid` FK → `posts(id)` | cascade |
| `round` | `integer` | default 1 |
| `editor_id` | `uuid` FK → `profiles(id)` | |
| `decision` | `text` | not null; check ∈ `{accept, request_revision, reject}` |
| `notes` | `text` | |
| `created_at` | `timestamptz` | default `now()` |

Unique on `(post_id, round)` — `recordEditorDecision()` upserts on that conflict, so a round can only ever have one final decision (later re-decisions overwrite, they don't append).

### 6.8 `citation_sequences`

| Column | Type | Notes |
|---|---|---|
| `year` | `integer` PK | |
| `counter` | `integer` | default 0 |
| `updated_at` | `timestamptz` | default `now()` |

### 6.9 `notifications` (relevant subset — full table serves the whole app, not just writing)

Final merged shape after all migrations: `id, user_id, type (text, wide check constraint — see below), message (text, nullable since 20260424000001), read (boolean), link (text), actor_id (uuid → profiles, on delete set null), post_id (uuid → posts, on delete cascade), comment_id (uuid → comments, on delete cascade), created_at`.

`type` check constraint, current form (after trust_safety_v1): `like, comment, follow, debate_reply, debate_argument, fellowship, badge, post_approved, post_rejected, post_published, review_assigned, revision_requested, co_author_invite, co_author_accepted, co_author_declined, response_post, opportunity_inquiry, moderation_post_removed, moderation_comment_hidden, account_suspended`. Note: `review_started` (used by `assignReviewer()`) and `post_approved` both appear inconsistent — `review_started` is inserted by app code but **is not in this check-constraint list** (only `post_approved` is listed, but the app never inserts `type: "post_approved"`, only `post_published`). This should be a hard DB error at insert time unless a later, unaudited migration extended the constraint further — flagged in §7 as needing verification against the live schema.

### 6.10 Row Level Security summary

| Table | Read | Write |
|---|---|---|
| `posts` | published rows: everyone. Own rows: author. Also visible to: assigned reviewer (`is_post_reviewer`), accepted/pending co-author (`is_post_coauthor`), and editors/admins for `status in (pending, pending_revision, rejected)` specifically (`editor_admin_read_editorial_posts`). | insert/update/delete: author only (`auth.uid() = author_id`); insert additionally blocked if `is_suspended()`. |
| `post_versions` | published version: everyone (via `posts.published_version_id` join). Otherwise: post author, assigned reviewer, coauthor, editor/admin. | Only the `service_role` admin client writes (`createVersionSnapshot` always uses `createAdminClient()`) — no direct-write RLS policy for authors exists, so version snapshots can only be created server-side. |
| `post_references` | published post's references: everyone. Owner, reviewer, coauthor: always. | insert/update/delete: post owner only (`is_post_owner`). |
| `post_authors` | accepted rows: everyone. Pending invite: the invitee only. | insert/update/delete: post owner only. |
| `post_reviews` | reviewer sees own assignment. Editor/admin: full access. | reviewer can only `update` their own row (submit recommendation); editor/admin has full `all`. Assignment (`insert`) is only reachable via the admin server action (uses admin client, bypassing RLS) — there is no RLS `insert` policy for `post_reviews` visible in the audited migrations, meaning even an editor's own session client couldn't assign a reviewer directly; it must go through `createAdminActionClient`. |
| `post_editor_decisions` | post author, assigned reviewer, coauthor: read. Editor/admin: full access. | editor/admin only. |
| `submission_tracks` | everyone | none (no insert/update/delete policy — track config is static seed data, changed only by migration). |
| `citation_sequences` | admin only (`is_admin()`) | none — writes only via the `security definer` RPC. |

---

## 7. Inconsistencies, duplication, and incomplete-looking areas

Ranked roughly by how likely each is to bite during a change to this system:

1. **Two sources of truth for "does this type need review."** `lib/reviewWorkflow.ts:REVIEWED_POST_TYPES`/`requiresEditorialWorkflow()` is a hardcoded `["research", "policy_brief"]` check, used everywhere in application code to branch behavior. The `submission_tracks.requires_review` DB column encodes the same fact but is only actually read/branched-on for reviewer-assignment gating in the admin review page and `getEditorialReviewState()` — `publishPost()` fetches the track but doesn't use its `requires_review` field to decide the publish-vs-pending branch, it re-derives that from `postType === "blog" || postType === "essay"` inline. Editing `submission_tracks` in the DB (e.g. to require review for essays) would silently do nothing in most of the write flow.

2. **Two independent, overlapping autosave debounce timers** (2s in `Editor.tsx`'s `onAutoSave` effect, 3s in `DraftManager.tsx`'s `saveDraft`) both ultimately write the same `posts` row, with two separate, desynced "Saved"/"Saving" UI indicators (editor toolbar vs. page header). A user can see "Saved" in one place and "Saving…" in the other simultaneously. Consolidating to one debounce/save-status source would remove a class of confusing-but-harmless UI bugs.

3. **Three copies of the same reference-validation and reference-sync logic**, byte-for-byte near-identical, in `write/actions.ts`, `edit/[slug]/actions.ts`, and `submit/research/actions.ts` (`normalizeReferences`, `validateReferences`, `syncReferences`). Same for `syncAuthors` (two copies: `write/actions.ts`, `submit/research/actions.ts`, with a subtle behavioral difference — the `write/actions.ts` version supports `correspondingAuthorId` being set independently by the caller after `syncAuthors` runs, sending co-author-invite notifications; the `submit/research/actions.ts` version derives `corresponding_author` purely from the `coAuthors` input's own flags and never sends invite notifications/emails at all — **research co-authors are silently never notified when invited**, unlike blog/essay/policy_brief co-authors).

4. **Subtitle-in-content encoding is a fragile, single-consumer convention.** `composeContentWithSubtitle`/`extractSubtitleFromContent` (marker: `<p data-subtitle="true" class="lead ta-subtitle">`) is only understood by `write/page.tsx` and `DraftManager.tsx`. The research flow's `buildResearchContent()` builds `content` directly and never goes through this encoding, so research posts have no subtitle concept at all (consistent, since the research form has no subtitle field — but worth knowing before extending research to support one). `sanitizePostHtml`'s `removeDraftSectionLabels()` strips an apparently unrelated legacy `Body:` label pattern, suggesting at least one prior content-encoding convention has already been retired this way — the subtitle marker is a candidate for the same fate if it's ever reworked.

5. **Word-counting logic is duplicated three times** with the same regex (`Editor.tsx`, `write/page.tsx`, `lib/postQuality.ts`) instead of a shared utility — low risk today since they agree, but a change to one (e.g. to handle non-breaking spaces or Tiptap's own `characterCount.words()`, which `Editor.tsx` actually prefers over its own `countWordsFromHtml` for the live count) will silently diverge from the others.

6. **`posts.pdf_url` is a dead column.** Present since the original base schema, never referenced anywhere in the current application code (confirmed via full-repo grep). Research manuscripts use `document_path`/`document_original_name`/`document_mime_type`/`document_size_bytes` instead. Safe to drop, or worth a comment noting it's intentionally retained for some external/reporting reason if it isn't.

7. **Rejected posts can be silently resubmitted.** `publishPost()` blocks republishing a `status = 'removed'` post with a clear error, but has no equivalent check for `status = 'rejected'` — an author can reopen `/write?draft=<rejected-post-id>`... actually `DraftManager` only loads posts where `status = 'draft'`, so a rejected post can't be reloaded via the normal draft flow. But `saveEditedPost` (edit route) has no `status === 'rejected'` guard either (only checks `published && requiresEditorialWorkflow`), so if a rejected post is reachable via `/edit/[slug]`, an author could edit and effectively resurrect it without going through a fresh submission — worth confirming intentional vs. gap.

8. **`notifications.type` has a dead value.** `post_approved` has been in the `notifications_type_check` constraint since `journal_system` and is still there as of the latest migration ([20260705000003_reviewer_removal_and_review_started_notice.sql](supabase/migrations/20260705000003_reviewer_removal_and_review_started_notice.sql)), but no audited code path ever inserts `type: "post_approved"` — the accept-decision flow uses `post_published` instead. (`review_started`, which *is* used by `assignReviewer()`, was missing from the constraint until that same migration added it — confirmed fixed, not a live bug.) `post_approved` looks like a naming choice that was abandoned mid-build; harmless to leave, but a candidate for removal next time this constraint is touched.

9. **`submission_tracks.allow_revision` is unused.** Seeded with real per-type values but no code path reads it — revision eligibility is instead implicitly controlled by whether an editor chooses `request_revision` as a decision, which is always available regardless of this flag.

10. **Local draft-backup legacy key (`thinkafrica_draft_backup`) is permanently retained** in every user's `localStorage` post-migration by explicit design (comment confirms this is intentional, not an oversight) — low impact, but it's dead weight that will never be cleaned up by this code.

11. **Slug collisions are not explicitly handled.** Both `buildSlugFromTitle` (timestamp-suffixed) and the custom-slug path rely on the DB's `unique` constraint on `posts.slug` to reject a collision, but neither `publishPost()` nor `DraftManager.saveDraft()` catches and translates that specific constraint-violation error into a user-friendly message — a colliding custom slug will surface as a raw Postgres error string.

12. **Co-author accept/decline flow could not be located** in the audited directories (`write/`, `edit/[slug]/`, `submit/research/`, `admin/review/`, `review/`), despite `co_author_accepted`/`co_author_declined` notification types existing in the schema and `post_authors.accepted_at` being read (but never *set* to a new value) by the write-side sync functions. This is very likely implemented elsewhere in the app (e.g. a notifications-panel action) and simply out of the directories this audit covered — flagged so it isn't assumed absent.
