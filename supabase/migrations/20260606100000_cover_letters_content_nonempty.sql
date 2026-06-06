ALTER TABLE public.cover_letters
  ADD CONSTRAINT content_nonempty CHECK (content <> '');
