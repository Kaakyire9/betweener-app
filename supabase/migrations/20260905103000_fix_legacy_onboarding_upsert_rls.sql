-- PostgreSQL evaluates SELECT visibility while resolving INSERT ... ON
-- CONFLICT DO UPDATE. A proposed insert has a freshly generated profile id,
-- so owner detection that only looks the id up in profiles cannot see it yet.
-- Keep the existing relationship/public visibility gate, but recognize the
-- authenticated owner directly from the row's immutable user_id.

alter policy profiles_select_authorized on public.profiles
using (
  auth.uid() is not null
  and (
    user_id = auth.uid()
    or public.can_authenticated_user_view_profile(id)
  )
);
