-- Deadline reminders for Debate V1.5.
--
-- V1.5 debates only move when their moderator advances them, and until now
-- nothing in the system noticed a deadline going by: every V1.5 notification
-- fires from a user action, and the two scheduled debate jobs are V2-only.
-- A debate whose moderator went quiet therefore stalled silently -- debaters
-- locked out of submitting, nobody told, indefinitely.
--
-- This table is the "already told them" ledger for the reminder job. The
-- reminder cron runs on a schedule, so without a durable record it would
-- re-send the same nudge on every run. Resend's Idempotency-Key only covers
-- a 24h window (and push has no equivalent at all), which is too short to
-- rely on for a job that may run for days against a stalled debate.

create table if not exists public.debate_v1_5_reminders (
  id uuid primary key default gen_random_uuid(),
  debate_id uuid not null references public.debates(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  -- 'deadline_soon' | 'deadline_missed_moderator' | 'deadline_missed_participant'
  kind text not null,
  -- The phase the reminder was about, so advancing to a new phase legitimately
  -- earns a fresh set of reminders rather than being suppressed by an old one.
  phase text not null,
  sent_at timestamptz not null default now(),
  constraint debate_v1_5_reminders_kind_check
    check (kind in ('deadline_soon', 'deadline_missed_moderator', 'deadline_missed_participant')),
  constraint debate_v1_5_reminders_phase_check
    check (phase in ('recruiting', 'opening', 'rebuttal', 'voting'))
);

-- The dedupe guarantee itself: one reminder of a given kind, per person, per
-- phase, per debate. The job inserts first and only sends if the insert won,
-- so a retry or an overlapping run cannot double-send.
create unique index if not exists debate_v1_5_reminders_unique_idx
  on public.debate_v1_5_reminders (debate_id, recipient_id, kind, phase);

create index if not exists debate_v1_5_reminders_debate_idx
  on public.debate_v1_5_reminders (debate_id);

alter table public.debate_v1_5_reminders enable row level security;

-- Deliberately no policies: this is bookkeeping for a service-role cron job.
-- Nothing in the client should read or write it, and with RLS on and no
-- policy, nothing can.
