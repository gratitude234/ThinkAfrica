-- Add in_response_to foreign key on posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS in_response_to uuid REFERENCES public.posts(id) ON DELETE SET NULL;

-- Efficient lookup of all responses to a post
CREATE INDEX IF NOT EXISTS posts_in_response_to_idx
  ON public.posts(in_response_to)
  WHERE in_response_to IS NOT NULL AND status = 'published';

-- Extend notifications type enum to include response_post
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    'like', 'comment', 'follow', 'debate_reply', 'debate_argument',
    'fellowship', 'badge', 'post_approved', 'post_rejected',
    'post_published', 'review_assigned', 'revision_requested',
    'co_author_invite', 'co_author_accepted', 'co_author_declined',
    'response_post'
  ]));
