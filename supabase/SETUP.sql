-- =============================================================================
-- SUPABASE SETUP FOR ECHOLABS (echo.eburon.ai)
-- Run this entire file in Supabase Dashboard → SQL Editor → New query
-- =============================================================================
-- Fixes: "Could not find table tts_history", "Could not find table user_assistants"
--        "Bucket not found" (tts-audio)
-- =============================================================================

-- 1. TTS History table + storage
create table if not exists public.tts_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  voice_id text not null,
  voice_name text not null,
  audio_path text not null,
  created_at timestamptz not null default now()
);

alter table public.tts_history enable row level security;

drop policy if exists "Users can select own tts_history" on public.tts_history;
create policy "Users can select own tts_history"
  on public.tts_history for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own tts_history" on public.tts_history;
create policy "Users can insert own tts_history"
  on public.tts_history for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete own tts_history" on public.tts_history;
create policy "Users can delete own tts_history"
  on public.tts_history for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('tts-audio', 'tts-audio', false)
on conflict (id) do nothing;

drop policy if exists "Users can read own tts-audio" on storage.objects;
create policy "Users can read own tts-audio"
  on storage.objects for select
  using (bucket_id = 'tts-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can insert own tts-audio" on storage.objects;
create policy "Users can insert own tts-audio"
  on storage.objects for insert
  with check (bucket_id = 'tts-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete own tts-audio" on storage.objects;
create policy "Users can delete own tts-audio"
  on storage.objects for delete
  using (bucket_id = 'tts-audio' and (storage.foldername(name))[1] = auth.uid()::text);

-- 2. User assistants table
create table if not exists public.user_assistants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  assistant_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_assistants enable row level security;

drop policy if exists "Users can select own user_assistants" on public.user_assistants;
create policy "Users can select own user_assistants"
  on public.user_assistants for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own user_assistants" on public.user_assistants;
create policy "Users can insert own user_assistants"
  on public.user_assistants for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own user_assistants" on public.user_assistants;
create policy "Users can update own user_assistants"
  on public.user_assistants for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own user_assistants" on public.user_assistants;
create policy "Users can delete own user_assistants"
  on public.user_assistants for delete using (auth.uid() = user_id);

-- 3. API keys + API usage logs
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
  on public.api_keys for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own api_keys" on public.api_keys;
create policy "Users can insert own api_keys"
  on public.api_keys for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own api_keys" on public.api_keys;
create policy "Users can update own api_keys"
  on public.api_keys for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own api_keys" on public.api_keys;
create policy "Users can delete own api_keys"
  on public.api_keys for delete using (auth.uid() = user_id);

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
  on public.api_usage for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own api_usage" on public.api_usage;
create policy "Users can insert own api_usage"
  on public.api_usage for insert with check (auth.uid() = user_id);
