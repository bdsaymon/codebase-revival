create table public.smfta_published_previews (
  id text primary key,
  owner_key text not null,
  title text not null default 'SMFTA Live Website',
  html text not null,
  files jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on public.smfta_published_previews to service_role;
alter table public.smfta_published_previews enable row level security;
-- No client policies: only the app server reads and writes shared website previews.
create trigger smfta_published_previews_touch before update on public.smfta_published_previews
  for each row execute function public.smfta_touch_updated_at();