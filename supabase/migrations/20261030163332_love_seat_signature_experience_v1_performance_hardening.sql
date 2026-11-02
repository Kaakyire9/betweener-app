-- Love Seat Signature Experience V1: targeted performance hardening.
begin;

create index if not exists circle_love_seat_arrival_ack_viewer_idx
  on public.circle_love_seat_arrival_acknowledgements(viewer_profile_id);

drop policy if exists circle_love_seat_updates_select_members on public.circle_love_seat_updates;
create policy circle_love_seat_updates_select_members
on public.circle_love_seat_updates for select to authenticated
using (
  public.is_circle_member(circle_id, (select auth.uid()))
  or public.is_circle_owner(circle_id, (select auth.uid()))
);

commit;
