-- Separate cooldown stamp for comment emails, deliberately not shared with
-- profiles.last_engagement_push_notified_at (used by push for comments/likes/
-- follows). Sharing one column across both channels would let a push send
-- suppress a legitimate email and vice versa, since each channel would stamp
-- and read the same timestamp independently of the other's send history.
alter table public.profiles
  add column if not exists last_comment_email_notified_at timestamptz;
