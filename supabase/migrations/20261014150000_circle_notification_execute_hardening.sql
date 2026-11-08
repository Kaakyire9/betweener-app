-- Circle notification helpers are trigger-internal. External callers must not be
-- able to choose arbitrary recipients or notification copy.

revoke all on function public.enqueue_circle_pulse_push(uuid, uuid, text, text, text, jsonb)
from public, anon, authenticated, service_role;

revoke all on function public.ensure_circle_pulse_welcome_member()
from public, anon, authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.enqueue_circle_pulse_push(uuid,uuid,text,text,text,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.enqueue_circle_pulse_push(uuid,uuid,text,text,text,jsonb)', 'execute')
     or has_function_privilege('service_role', 'public.enqueue_circle_pulse_push(uuid,uuid,text,text,text,jsonb)', 'execute') then
    raise exception 'circle_push_helper_execute_grant_not_hardened';
  end if;

  if has_function_privilege('anon', 'public.ensure_circle_pulse_welcome_member()', 'execute')
     or has_function_privilege('authenticated', 'public.ensure_circle_pulse_welcome_member()', 'execute')
     or has_function_privilege('service_role', 'public.ensure_circle_pulse_welcome_member()', 'execute') then
    raise exception 'circle_welcome_trigger_execute_grant_not_hardened';
  end if;
end;
$$;

comment on function public.enqueue_circle_pulse_push(uuid, uuid, text, text, text, jsonb) is
  'Internal Circle Pulse push producer. Trigger-owned execution only; never client callable.';

comment on function public.ensure_circle_pulse_welcome_member() is
  'Internal Circle membership trigger function. Never client callable.';
