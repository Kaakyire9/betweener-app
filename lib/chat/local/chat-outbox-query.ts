export const CHAT_PENDING_OUTBOX_DUE_QUERY = `
  select *
  from (
    select *
    from chat_pending_outbox
    where owner_user_id = ?
      and status = 'queued'
      and (next_retry_at is null or next_retry_at <= ?)

    union all

    select *
    from chat_pending_outbox
    where owner_user_id = ?
      and status = 'sending'
      and updated_at <= ?
      and (next_retry_at is null or next_retry_at <= ?)
  )
  order by created_at asc
  limit ?
`;

export const buildPendingOutboxDueQueryParams = ({
  ownerUserId,
  now,
  staleSendingBefore,
  limit,
}: {
  ownerUserId: string;
  now: string;
  staleSendingBefore: string;
  limit: number;
}) => [
  ownerUserId,
  now,
  ownerUserId,
  staleSendingBefore,
  now,
  limit,
] as const;
