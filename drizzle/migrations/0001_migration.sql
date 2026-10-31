alter table public.smfta_user_state
  add column if not exists custom_prompts jsonb not null default '[]'::jsonb,
  add column if not exists active_project jsonb,
  add column if not exists workspace jsonb,
  add column if not exists connections jsonb;