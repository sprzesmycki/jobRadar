CREATE TABLE public.cover_letters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id  text NOT NULL,
  source       text NOT NULL,
  job_hash     text NOT NULL,
  content      text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);
ALTER TABLE public.cover_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cover letters" ON public.cover_letters
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
