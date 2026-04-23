alter table public.posts
  add column if not exists audio_summary_url text;

comment on column public.posts.audio_summary_url is
  'URL to the MP3 audio summary file in Supabase Storage bucket audio-summaries. Generated async on publish. NULL means not yet generated or generation failed.';
