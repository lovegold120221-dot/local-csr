-- API keys and usage tracking

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Default key',
  key_hash text not null unique,
  key_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_api_keys_user_created
  on public.api_keys (user_id, created_at desc);

create index if not exists idx_api_keys_key_hash
  on public.api_keys (key_hash);

alter table public.api_keys enable row level security;

drop policy if exists "Users can select own api_keys" on public.api_keys;
create policy "Users can select own api_keys"
  on public.api_keys for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own api_keys" on public.api_keys;
create policy "Users can insert own api_keys"
  on public.api_keys for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own api_keys" on public.api_keys;
create policy "Users can update own api_keys"
  on public.api_keys for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own api_keys" on public.api_keys;
create policy "Users can delete own api_keys"
  on public.api_keys for delete
  using (auth.uid() = user_id);

create table if not exists public.api_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  endpoint text not null,
  method text not null,
  status_code integer not null,
  latency_ms integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_usage_user_created
  on public.api_usage (user_id, created_at desc);

create index if not exists idx_api_usage_endpoint_created
  on public.api_usage (endpoint, created_at desc);

alter table public.api_usage enable row level security;

drop policy if exists "Users can select own api_usage" on public.api_usage;
create policy "Users can select own api_usage"
  on public.api_usage for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own api_usage" on public.api_usage;
create policy "Users can insert own api_usage"
  on public.api_usage for insert
  with check (auth.uid() = user_id);

