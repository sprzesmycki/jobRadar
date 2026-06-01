alter table public.job_preferences
  add column if not exists include_unknown_salary boolean not null default true;
