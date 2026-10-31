create table public.smfta_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_data_url text,
  legacy_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.smfta_user_state (
  user_id uuid primary key,
  settings jsonb not null default '{}'::jsonb,
  memory jsonb not null default '[]'::jsonb,
  saved_profiles jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  widgets jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  autonomy text,
  updated_at timestamptz not null default now()
);

create table public.smfta_chat_sessions (
  user_id uuid not null,
  session_id bigint not null,
  title text not null default 'New Chat',
  title_source text,
  pinned boolean not null default false,
  draft text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, session_id)
);
create index idx_smfta_sessions_user_updated on public.smfta_chat_sessions (user_id, updated_at desc);

grant select, insert, update, delete on public.smfta_profiles to authenticated;
grant select, insert, update, delete on public.smfta_user_state to authenticated;
grant select, insert, update, delete on public.smfta_chat_sessions to authenticated;
grant all on public.smfta_profiles to service_role;
grant all on public.smfta_user_state to service_role;
grant all on public.smfta_chat_sessions to service_role;

alter table public.smfta_profiles enable row level security;
alter table public.smfta_user_state enable row level security;
alter table public.smfta_chat_sessions enable row level security;

create policy smfta_profiles_owner_all on public.smfta_profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy smfta_user_state_owner_all on public.smfta_user_state for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy smfta_sessions_owner_all on public.smfta_chat_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.smfta_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger smfta_profiles_touch before update on public.smfta_profiles
  for each row execute function public.smfta_touch_updated_at();
create trigger smfta_user_state_touch before update on public.smfta_user_state
  for each row execute function public.smfta_touch_updated_at();
create trigger smfta_sessions_touch before update on public.smfta_chat_sessions
  for each row execute function public.smfta_touch_updated_at();

create or replace function public.handle_smfta_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.smfta_profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into public.smfta_user_state (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created_smfta after insert on auth.users
  for each row execute function public.handle_smfta_new_user();