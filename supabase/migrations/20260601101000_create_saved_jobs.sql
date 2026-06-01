create table if not exists public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null,
  source text not null,
  title text not null,
  company text not null,
  url text not null,
  status text not null default 'interested' check (status in ('interested', 'applied', 'rejected')),
  notes text,
  snapshot jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_id)
);

alter table public.saved_jobs enable row level security;

create policy "saved_jobs_select_own"
  on public.saved_jobs
  for select
  using (auth.uid() = user_id);

create policy "saved_jobs_insert_own"
  on public.saved_jobs
  for insert
  with check (auth.uid() = user_id);

create policy "saved_jobs_update_own"
  on public.saved_jobs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists saved_jobs_set_updated_at on public.saved_jobs;

create trigger saved_jobs_set_updated_at
  before update on public.saved_jobs
  for each row
  execute function public.set_updated_at();
