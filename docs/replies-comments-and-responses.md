# Replies: comments and Responses

Indegenius has two ways to reply, and they are not redundant. Read this before
removing either one.

## The two tiers

| | **Comment** | **Response** |
|---|---|---|
| Storage | `comments` row | `posts` row with `in_response_to` |
| Lives | on the parent's page | its own page, with a slug |
| Home feed | never | yes, as a feed card |
| Leaderboard points | none | yes |
| Threading | one level (`parent_id`) | backlink to the parent |
| Written with | the reply box, by default | the reply box, "Publish as a Response" |

A comment is the default because most replies are remarks. A Response is a
publication that happens to answer another one — a counter-argument worth its
own page and citation.

## Why comments came back

Commit `4956cc6` (23 Jul 2026) deleted `CommentsSection.tsx`, `CommentsLoader.tsx`
and `commentActions.ts`, on the grounds that "the Indegenius mockup shows only
Responses". The table, its RLS, its vote RPC and its moderation columns were
left in place.

The consequence, once the reply box shipped, was that **every reply became a
published post**: a one-line joke earned a slug, a detail page, a card in the
home feed and 10 leaderboard points — the same as a researched essay. The
mockup had not anticipated that, because it did not describe what replying
costs.

So comments were restored (from that commit's parent, adapted) rather than
rebuilt, and the reply box now writes a comment unless the writer explicitly
promotes it. If a future change proposes removing comments again to match a
mockup, this is the trade-off to weigh: the mockup's simplicity against every
"Lmao" becoming a permanent publication.

## Things that will bite you

- **`comments.upvotes` is only correct if you go through `toggle_comment_vote`.**
  The RPC is `SECURITY DEFINER` and updates the counter; the RLS DELETE policy
  on `comment_votes` permits a raw delete that decrements nothing.
- **Never read comments with the admin client.** Moderation hiding is enforced
  entirely by the RLS SELECT policy (`hidden_at is null or auth.uid() =
  author_id or public.is_admin()`), so a service-role read leaks hidden rows.
  A per-viewer count difference is expected: an author sees their own hidden
  comment.
- **`parent_id` is `ON DELETE CASCADE`.** Deleting a comment that has replies
  would destroy other people's writing, so `deleteComment` tombstones it
  instead and only hard-deletes when it is childless.
- **The moderation queue deep-links to `/post/<slug>#comments`.** The
  discussion section must keep that anchor id.
- **`set_notification_preference` validates against a hardcoded key list.** A
  new preference key needs a migration redefining that function, or saving the
  toggle throws.
- **Comments award no points.** The `on_comment_points` trigger (+3 per insert)
  was dropped in `20260802000001_comments_ui_restore.sql`. Points belong to
  Responses.
