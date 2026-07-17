# Content model migration (Post / Article / Research)

## Target model

Indegenius's publishing model is moving from four flat post types to three
content kinds:

1. **Post** — lightweight, short-form. Title will eventually be optional.
   Publishes immediately. Not formally reviewed or citable.
2. **Article** — long-form rich text. Title required. Publishes
   immediately. Essay and Policy Brief become optional *genres* of Article
   (`article_format`), not top-level publishing types.
3. **Research** — formal research-paper record: title, abstract, PDF,
   authors, topics, references. Goes through the existing editorial review
   workflow. Becomes citable only after acceptance.

## Legacy mapping

The existing `posts.type` values map onto the new model as:

| legacy `type`  | `content_kind` | `article_format` |
|----------------|----------------|-------------------|
| `blog`         | `post`         | —                 |
| `essay`        | `article`      | `essay`           |
| `policy_brief` | `article`      | `policy_brief`    |
| `research`     | `research`     | —                 |

`lib/contentModel.ts` is the single source of truth for this mapping and
for resolving a post's effective classification from either column.

## Why expand-and-contract

This is being rolled out as an **expand-and-contract** migration:

- **Expand (Phase 1, this change):** add nullable `content_kind` and
  `article_format` columns additively, backfill them from `type`, and have
  every write path dual-write both the legacy and new columns. `type`
  keeps its `NOT NULL` constraint and existing check constraint —
  nothing that reads `type` today breaks.
- **Migrate:** later phases build the new Post/Article composer UI on top
  of `content_kind`/`article_format`, move status/feed/profile logic off
  of `type`, and treat review/credibility as derived from workflow
  evidence (`citation_id`, `published_version_id`, completed reviews) —
  never from `content_kind` alone.
- **Contract (a later phase):** once every reader and writer has moved
  onto the new columns, drop the temporary sync trigger, drop `type`, and
  make `content_kind` the required column.

Doing it this way means the database migration, the application code, and
any rollback can each ship independently without a coordinated cutover.

## What stays temporarily

- `posts.type` (`NOT NULL`, existing check constraint) — still the
  authoritative column for every current read path (status logic, feed
  filters, review workflow, submission tracks, points).
- `public.sync_post_content_classification()` trigger — backfills
  `content_kind`/`article_format` from `type` for any insert/update that
  doesn't set them explicitly (never overwrites an explicit value). This
  covers write paths that haven't been updated yet and the deploy window
  where the migration lands before the application code does.

## What later phases will do

- Build the new Post/Article composer and make `title` optional for
  `content_kind = post`.
- Move publish-status, feed, and profile logic to key off
  `content_kind`/`article_format` instead of `type`.
- Derive "reviewed"/"credible" from workflow evidence, not content kind.
- Once all paths are confirmed to dual-write consistently, drop the sync
  trigger and begin the contract step (retire `type`).
