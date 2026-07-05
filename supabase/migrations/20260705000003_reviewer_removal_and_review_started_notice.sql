-- Two related fixes to the peer-review pipeline:
--
-- 1. Reviewer assignments could never be undone. If an assigned reviewer
--    went silent, `getEditorialReviewState` ("all assigned reviewers must
--    submit a recommendation") would block the editor forever with no way
--    to free up the slot. Add a `removed_at` marker so an editor can
--    withdraw a stalled assignment without deleting any feedback the
--    reviewer may have already submitted, and without it counting against
--    the completion tally.
--
-- 2. Authors got no signal that review had started - only a final
--    accept/revise/reject notification. Add `review_started` to the
--    notifications type check so we can tell the author the moment their
--    first reviewer is assigned.

alter table public.post_reviews
  add column if not exists removed_at timestamptz;

create index if not exists post_reviews_active_idx
  on public.post_reviews(post_id, round)
  where removed_at is null;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type = any (array[
    'like', 'comment', 'follow', 'debate_reply', 'debate_argument',
    'fellowship', 'badge', 'post_approved', 'post_rejected',
    'post_published', 'review_assigned', 'review_started', 'revision_requested',
    'co_author_invite', 'co_author_accepted', 'co_author_declined',
    'response_post', 'opportunity_inquiry',
    'moderation_post_removed', 'moderation_comment_hidden', 'account_suspended'
  ]));
