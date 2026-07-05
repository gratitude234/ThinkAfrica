-- Soft-SLA reminder for reviewers who haven't submitted a recommendation.
--
-- `reminded_at` tracks whether a reminder has already gone out for this
-- assignment, so the job can never re-notify the same person on every run
-- (the cron job below always filters on `reminded_at is null`).

alter table public.post_reviews
  add column if not exists reminded_at timestamptz;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type = any (array[
    'like', 'comment', 'follow', 'debate_reply', 'debate_argument',
    'fellowship', 'badge', 'post_approved', 'post_rejected',
    'post_published', 'review_assigned', 'review_started', 'review_reminder',
    'revision_requested',
    'co_author_invite', 'co_author_accepted', 'co_author_declined',
    'response_post', 'opportunity_inquiry',
    'moderation_post_removed', 'moderation_comment_hidden', 'account_suspended'
  ]));
