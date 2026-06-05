insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cvs', 'cvs', false, 6291456, array['application/pdf'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.cv_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  storage_bucket text not null default 'cvs',
  storage_path text not null,
  file_name text not null,
  file_size integer not null check (file_size > 0),
  content_type text not null default 'application/pdf',
  full_name text,
  email text,
  phone text,
  links text[] not null default '{}',
  skills text[] not null default '{}',
  role_hints text[] not null default '{}',
  experience_highlights text[] not null default '{}',
  extracted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_bucket = 'cvs'),
  check (content_type = 'application/pdf')
);

alter table public.cv_profiles enable row level security;

create policy "cv_profiles_select_own"
  on public.cv_profiles
  for select
  using (auth.uid() = user_id);

create policy "cv_profiles_insert_own"
  on public.cv_profiles
  for insert
  with check (auth.uid() = user_id);

create policy "cv_profiles_update_own"
  on public.cv_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "cv_profiles_delete_own"
  on public.cv_profiles
  for delete
  using (auth.uid() = user_id);

create trigger if not exists cv_profiles_set_updated_at
  before update on public.cv_profiles
  for each row
  execute function public.set_updated_at();

create policy "cv_storage_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "cv_storage_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "cv_storage_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "cv_storage_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
