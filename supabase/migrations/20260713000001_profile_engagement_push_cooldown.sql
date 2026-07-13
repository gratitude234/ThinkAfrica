-- Shared cooldown stamp for bursty, many-senders-to-one-recipient push
-- notifications (comments, likes, follows). A single column so a recipient
-- can't get buzzed repeatedly across different event types within the
-- cooldown window enforced in lib/push.ts.
alter table public.profiles
  add column if not exists last_engagement_push_notified_at timestamptz;
