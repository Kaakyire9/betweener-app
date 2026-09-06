-- Restore onboarding access to the trigger's narrow validation helpers.
-- The helpers are safe boolean validators; the full detector remains service-only.

alter function public.profile_guard_structured_text_is_valid(text, text)
  security definer;
alter function public.profile_guard_location_is_derived(text, text, text, text)
  security definer;

revoke all on function public.profile_guard_structured_text_is_valid(text, text)
  from public, anon;
revoke all on function public.profile_guard_location_is_derived(text, text, text, text)
  from public, anon;

grant execute on function public.profile_guard_structured_text_is_valid(text, text)
  to authenticated;
grant execute on function public.profile_guard_location_is_derived(text, text, text, text)
  to authenticated;

-- Keep direct access to the broader detector closed. The structured validator
-- invokes it with owner privileges only after enforcing strict field bounds.
revoke all on function public.profile_guard_assess(text)
  from public, anon, authenticated;
grant execute on function public.profile_guard_assess(text)
  to service_role;
