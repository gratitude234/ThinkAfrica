-- Award a modest points credential for submitting a peer review.
--
-- Existing point values (schema_phase2.sql, award_points_on_publish /
-- award_points_on_like / award_points_on_comment): publish 10-50
-- (type-weighted), like +2, comment +3. Reviewing a submission is more
-- effortful than a like or comment (reading the work, weighing evidence,
-- writing structured feedback) but isn't original content creation, so it
-- sits between "engagement" (like/comment) and "publish": +5 points.
--
-- Fires only on the null -> non-null transition of `submitted_at`, exactly
-- mirroring the `old.status != 'published' and new.status = 'published'`
-- guard used by award_points_on_publish. This guarantees:
--   - a review can only ever award points once (submitted_at can't go back
--     to null, so the transition can't repeat)
--   - removing a reviewer (`removed_at`) never touches `submitted_at`, so
--     removal can never re-fire this trigger or claw back points already
--     awarded for real, already-submitted feedback

create or replace function public.award_points_on_review_submission()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.submitted_at is null and new.submitted_at is not null then
    update public.profiles
    set points = points + 5
    where id = new.reviewer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_review_submitted_points on public.post_reviews;
create trigger on_review_submitted_points
  after update on public.post_reviews
  for each row execute procedure public.award_points_on_review_submission();
