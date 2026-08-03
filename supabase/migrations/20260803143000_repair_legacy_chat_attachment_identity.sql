-- Repair legacy attachment rows created before canonical attachment identity
-- was database-enforced. The original backfill assigned attachments a stable
-- `legacy-<message-id>` client identity but left messages.client_message_id
-- null. Refuse to repair any other mismatch automatically.

do $$
declare
  v_unsafe_mismatches bigint;
  v_conflicting_repairs bigint;
begin
  select count(*)
  into v_unsafe_mismatches
  from public.message_attachments attachment_row
  left join public.messages message_row
    on message_row.id = attachment_row.message_id
  where message_row.id is null
     or attachment_row.sender_id is distinct from message_row.sender_id
     or attachment_row.receiver_id is distinct from message_row.receiver_id
     or (
       message_row.client_message_id is not null
       and attachment_row.client_message_id is distinct from message_row.client_message_id
     )
     or (
       message_row.client_message_id is null
       and attachment_row.client_message_id is distinct from
         ('legacy-' || message_row.id::text)
     );

  if v_unsafe_mismatches > 0 then
    raise exception using
      errcode = '23514',
      message = 'unsafe_legacy_attachment_identity_mismatch',
      detail = format('%s attachment rows require manual investigation', v_unsafe_mismatches);
  end if;

  -- A message must never have multiple attachment-level client identities.
  if exists (
    select 1
    from public.message_attachments attachment_row
    group by attachment_row.message_id
    having count(distinct attachment_row.client_message_id) <> 1
  ) then
    raise exception using
      errcode = '23514',
      message = 'legacy_attachment_identity_not_unique_per_message';
  end if;

  -- Preserve the global sender/client-message idempotency guarantee. If this
  -- fails, a different canonical message already owns the proposed identity.
  select count(*)
  into v_conflicting_repairs
  from public.messages message_row
  join public.message_attachments attachment_row
    on attachment_row.message_id = message_row.id
  join public.messages conflicting_message
    on conflicting_message.sender_id = message_row.sender_id
   and conflicting_message.client_message_id = attachment_row.client_message_id
   and conflicting_message.id <> message_row.id
  where message_row.client_message_id is null;

  if v_conflicting_repairs > 0 then
    raise exception using
      errcode = '23505',
      message = 'legacy_attachment_identity_conflicts_with_canonical_message',
      detail = format('%s proposed repairs conflict with an existing message', v_conflicting_repairs);
  end if;
end;
$$;

with repairable_messages as (
  select
    message_row.id,
    min(attachment_row.client_message_id) as client_message_id
  from public.messages message_row
  join public.message_attachments attachment_row
    on attachment_row.message_id = message_row.id
  where message_row.client_message_id is null
  group by message_row.id
  having count(distinct attachment_row.client_message_id) = 1
)
update public.messages message_row
set client_message_id = repairable.client_message_id
from repairable_messages repairable
where message_row.id = repairable.id
  and message_row.client_message_id is null;

-- The NOT VALID constraint already protected new writes. Validation now proves
-- every historical attachment has the same canonical message identity too.
alter table public.message_attachments
  validate constraint message_attachments_canonical_identity_fkey;
