CREATE TABLE public.job_scores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id  text NOT NULL,
  source       text NOT NULL,
  job_hash     text NOT NULL,
  score        integer NOT NULL CHECK (score >= 0 AND score <= 100),
  explanation  text NOT NULL,
  matched_skills text[] NOT NULL DEFAULT '{}',
  missing_skills text[] NOT NULL DEFAULT '{}',
  scored_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);
ALTER TABLE public.job_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own scores" ON public.job_scores
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
