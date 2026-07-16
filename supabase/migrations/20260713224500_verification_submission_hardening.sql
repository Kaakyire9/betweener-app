-- Verification submissions require an authenticated member. The functions
-- already enforce auth.uid(); removing anon execute is defense in depth.

revoke execute on function public.rpc_submit_manual_verification_request(
  uuid,
  text,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text
) from anon;

revoke execute on function public.rpc_submit_selfie_liveness_verification(
  uuid,
  text,
  text,
  text,
  text
) from anon;

grant execute on function public.rpc_submit_manual_verification_request(
  uuid,
  text,
  text,
  numeric,
  text,
  text,
  text,
  text,
  text
) to authenticated;

grant execute on function public.rpc_submit_selfie_liveness_verification(
  uuid,
  text,
  text,
  text,
  text
) to authenticated;
