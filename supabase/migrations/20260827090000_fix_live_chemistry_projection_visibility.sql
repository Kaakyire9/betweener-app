-- Chemistry RPCs create or update reveal state and immediately return the
-- caller-private projection. A STABLE projection is pinned to the calling
-- statement snapshot and can miss those writes, producing a false
-- live_chemistry_unavailable response while concealment correctly remains on.
-- VOLATILE gives each projection query a current command snapshot without
-- changing its grants, security-definer boundary, or privacy contract.

begin;

alter function public.live_chemistry_private_projection(uuid) volatile;

commit;
