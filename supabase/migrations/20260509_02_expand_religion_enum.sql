-- Global onboarding already offers non-Abrahamic faith options.
-- Expand the profile religion enum so onboarding, profile edit, and filters are aligned.

alter type public.religion add value if not exists 'JEWISH';
alter type public.religion add value if not exists 'HINDU';
alter type public.religion add value if not exists 'BUDDHIST';
alter type public.religion add value if not exists 'SPIRITUAL';
alter type public.religion add value if not exists 'NONE';
