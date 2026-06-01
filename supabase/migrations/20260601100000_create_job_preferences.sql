create table if not exists public.job_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_roles text[] not null default '{}',
  technologies text[] not null default '{}',
  min_salary_amount integer,
  salary_currency text not null default 'EUR' check (salary_currency in ('EUR', 'USD', 'PLN')),
  work_modes text[] not null default '{}',
  locations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_preferences enable row level security;

create policy "job_preferences_select_own"
  on public.job_preferences
  for select
  using (auth.uid() = user_id);

create policy "job_preferences_insert_own"
  on public.job_preferences
  for insert
  with check (auth.uid() = user_id);

create policy "job_preferences_update_own"
  on public.job_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_preferences_set_updated_at on public.job_preferences;

create trigger job_preferences_set_updated_at
  before update on public.job_preferences
  for each row
  execute function public.set_updated_at();
