-- Close deterministic gaps for explicit paid-platform promotion and
-- first-person external-messaging availability statements.
begin;

-- Re-enforcement must retain the visibility preference captured by the first
-- unresolved action instead of treating the Guard's own hidden state as the
-- user's preference.
create or replace function public.profile_guard_preserve_original_visibility()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_prior_discoverable boolean;
begin
  if new.source <> 'moderation_action'
     or new.decision not in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE') then
    return new;
  end if;

  select (event_row.metadata->>'prior_discoverable')::boolean
  into v_prior_discoverable
  from public.profile_moderation_events event_row
  where event_row.profile_id = new.profile_id
    and event_row.resolved_at is null
    and event_row.source in ('backfill', 'moderation_action')
    and event_row.decision in ('REQUIRE_REWRITE', 'RESTRICT_PROFILE')
    and event_row.metadata ? 'prior_discoverable'
  order by event_row.created_at asc
  limit 1;

  if found then
    new.metadata := jsonb_set(
      new.metadata,
      '{prior_discoverable}',
      to_jsonb(v_prior_discoverable),
      true
    );
  end if;

  return new;
end;
$$;

revoke all on function public.profile_guard_preserve_original_visibility()
from public, anon, authenticated, service_role;

drop trigger if exists profile_guard_preserve_original_visibility
on public.profile_moderation_events;
create trigger profile_guard_preserve_original_visibility
before insert on public.profile_moderation_events
for each row
execute function public.profile_guard_preserve_original_visibility();

create or replace function public.profile_guard_assess(p_text text)
returns jsonb
language plpgsql immutable
set search_path = public, pg_catalog
as $$
declare
  v_text text := lower(normalize(coalesce(p_text, ''), NFKC));
  v_compact text;
  v_signals text[] := '{}';
  v_score numeric := 0;
begin
  v_text := replace(replace(replace(replace(replace(
    v_text, chr(8203), ''), chr(8204), ''), chr(8205), ''),
    chr(8288), ''), chr(65279), '');
  v_text := regexp_replace(replace(replace(replace(replace(replace(
    v_text, chr(160), ' '), chr(65039), ''), chr(8419), ''),
    'â€¢', '.'), 'Â·', '.'), '\s+', ' ', 'g');
  v_text := translate(
    v_text,
    'Ù Ù¡Ù¢Ù£Ù¤Ù¥Ù¦Ù§Ù¨Ù©Û°Û±Û²Û³Û´ÛµÛ¶Û·Û¸Û¹',
    '01234567890123456789'
  );
  v_compact := regexp_replace(v_text, '[\s.\-_/()\[\]{}]+', '', 'g');

  if v_text ~ '(^|[^0-9])[+]?[0-9][0-9 .()/-]{7,}[0-9]([^0-9]|$)'
     or v_text ~ '\m(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|[0-9])(?:[ .,-]*(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|[0-9])){8,}\M' then
    v_signals := array_append(v_signals, 'PHONE_CONTACT');
    v_score := v_score + .98;
  end if;
  if v_text ~ '(^|[^a-z0-9])[a-z0-9._%+-]+\s*(@|\[?at\]?)\s*[a-z0-9.-]+\s*(\.|\[?dot\]?)\s*[a-z]{2,}($|[^a-z])' then
    v_signals := array_append(v_signals, 'EMAIL_CONTACT');
    v_score := v_score + .98;
  end if;
  if v_text ~ '\m(https?://|www\.)[^[:space:]]+'
     or v_text ~ '\m[a-z0-9-]+\.(com|net|org|io|co\.uk|me|app|link)\M' then
    v_signals := array_append(v_signals, 'URL_REDIRECTION');
    v_score := v_score + .96;
  end if;
  if (
       v_compact ~ '(whatsapp|telegram|snapchat|signal|instagram|insta)'
       or v_text ~ '\m(green app|paper plane app|elsewhere)\M'
     ) and (
       v_text ~ '\m(message|text|contact|reach|find|follow|dm|signal|whats\s*app|telegram|snap(chat)?|insta(gram)?)\s+me\M|\mi\s*(do not|don''t)\s+reply\s+here\M|\msame username everywhere\M'
       or v_compact ~ '(whatsapp|telegram|snapchat|signal|instagram|insta)me'
       or v_text ~ '\m(i''m|i am|im)\s+(online|available)?\s*(on|via)\s+(whats\s*app|telegram|snap(chat)?|signal|insta(gram)?)\M'
       or v_text ~ '\m(find|reach|contact|message|text|dm)\s+me\s+(on|via)\s+(whats\s*app|telegram|snap(chat)?|signal|insta(gram)?)\M'
     ) then
    v_signals := array_append(v_signals, 'EXTERNAL_MESSAGING');
    v_score := v_score + .90;
  end if;
  if v_text ~ '\m(exclusive|premium|private|uncensored|spicy)\s+(content|page|access)\M|\m(subscribe|pay)\M.{0,35}\m(content|page|access)\M' then
    v_signals := array_append(v_signals, 'PAID_CONTENT_PROMOTION');
    v_score := v_score + .84;
  end if;
  if v_text ~ '\m(only\s*fan(s|\$)?|fansly|fanvue)\M'
     and v_text ~ '\m(my|see|view|find|follow|visit|subscribe|exclusive|private|content|page|profile)\M' then
    v_signals := array_append(v_signals, 'PAID_CONTENT_PROMOTION');
    v_score := v_score + .96;
  end if;
  if v_text ~ '\m(come see what i can''?t show here|ask me where i post (my )?private|ask me where to find my uncensored|special private page for people who want more|subscribers get access to everything)\M' then
    v_signals := array_append(v_signals, 'PAID_CONTENT_PROMOTION');
    v_score := v_score + .72;
  end if;
  if v_text ~ '\m(cash\s*app|venmo|paypal|send me money|send btc|crypto investment)\M|\mguaranteed\M.{0,25}\mreturns\M' then
    v_signals := array_append(v_signals, 'FINANCIAL_SOLICITATION');
    v_score := v_score + .90;
  end if;

  return jsonb_build_object(
    'categories', v_signals,
    'risk_score', least(1, v_score),
    'decision', case
      when array_length(v_signals, 1) is null then 'ALLOW'
      when 'PHONE_CONTACT' = any(v_signals)
        and (
          'EXTERNAL_MESSAGING' = any(v_signals)
          or 'PAID_CONTENT_PROMOTION' = any(v_signals)
        ) then 'RESTRICT_PROFILE'
      else 'REQUIRE_REWRITE'
    end
  );
end;
$$;

revoke all on function public.profile_guard_assess(text)
from public, anon, authenticated;
grant execute on function public.profile_guard_assess(text)
to service_role;

commit;
