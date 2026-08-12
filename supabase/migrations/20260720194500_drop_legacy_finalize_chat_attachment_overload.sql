begin;

drop function if exists public.rpc_finalize_chat_attachment(
  uuid,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  bigint,
  integer,
  integer,
  integer,
  text,
  uuid,
  text,
  jsonb,
  boolean,
  text,
  text,
  text,
  text,
  text,
  jsonb
);

commit;
