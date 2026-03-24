alter table public.profile_prompts
  add column if not exists prompt_type text not null default 'standard',
  add column if not exists guess_mode text,
  add column if not exists guess_options jsonb,
  add column if not exists hint_text text,
  add column if not exists normalized_answer text,
  add column if not exists reveal_policy text not null default 'never';

update public.profile_prompts
set prompt_type = 'standard'
where prompt_type is null;

update public.profile_prompts
set reveal_policy = 'never'
where reveal_policy is null;

create table if not exists public.profile_prompt_guesses (
  id uuid primary key default gen_random_uuid(),
  profile_prompt_id uuid not null references public.profile_prompts(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  viewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  guessed_value text not null,
  normalized_guess text not null,
  is_correct boolean not null default false,
  attempts_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_prompt_id, viewer_profile_id)
);

create index if not exists profile_prompt_guesses_target_profile_id_idx
  on public.profile_prompt_guesses (target_profile_id);
create index if not exists profile_prompt_guesses_viewer_profile_id_idx
  on public.profile_prompt_guesses (viewer_profile_id);

create or replace function public.set_profile_prompt_guesses_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profile_prompt_guesses_set_updated_at on public.profile_prompt_guesses;
create trigger profile_prompt_guesses_set_updated_at
before update on public.profile_prompt_guesses
for each row execute function public.set_profile_prompt_guesses_updated_at();

alter table public.profile_prompt_guesses enable row level security;

drop policy if exists "profile_prompt_guesses_select_viewer" on public.profile_prompt_guesses;
create policy "profile_prompt_guesses_select_viewer"
on public.profile_prompt_guesses
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_prompt_guesses.viewer_profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "profile_prompt_guesses_insert_viewer" on public.profile_prompt_guesses;
create policy "profile_prompt_guesses_insert_viewer"
on public.profile_prompt_guesses
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = profile_prompt_guesses.viewer_profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "profile_prompt_guesses_update_viewer" on public.profile_prompt_guesses;
create policy "profile_prompt_guesses_update_viewer"
on public.profile_prompt_guesses
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_prompt_guesses.viewer_profile_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = profile_prompt_guesses.viewer_profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "profile_prompt_guesses_delete_viewer" on public.profile_prompt_guesses;
create policy "profile_prompt_guesses_delete_viewer"
on public.profile_prompt_guesses
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_prompt_guesses.viewer_profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "profile_prompts_select_public" on public.profile_prompts;

drop policy if exists "profile_prompts_select_owner" on public.profile_prompts;
create policy "profile_prompts_select_owner"
on public.profile_prompts
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_prompts.profile_id
      and p.user_id = auth.uid()
  )
);

create or replace function public.get_viewed_profile_prompts(
  p_profile_id uuid,
  p_viewer_profile_id uuid default null
)
returns table (
  id uuid,
  profile_id uuid,
  prompt_key text,
  prompt_title text,
  prompt_type text,
  answer text,
  guess_mode text,
  guess_options jsonb,
  hint_text text,
  reveal_policy text,
  viewer_guess text,
  viewer_guess_is_correct boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_authorized_viewer uuid;
begin
  if p_viewer_profile_id is not null then
    select p.id
      into v_authorized_viewer
    from public.profiles p
    where p.id = p_viewer_profile_id
      and p.user_id = auth.uid()
    limit 1;
  end if;

  return query
  select
    pp.id,
    pp.profile_id,
    pp.prompt_key,
    pp.prompt_title,
    coalesce(pp.prompt_type, 'standard') as prompt_type,
    case
      when coalesce(pp.prompt_type, 'standard') = 'standard' then pp.answer
      when coalesce(pp.reveal_policy, 'never') = 'after_correct' and coalesce(g.is_correct, false) then pp.answer
      else ''
    end as answer,
    pp.guess_mode,
    pp.guess_options,
    pp.hint_text,
    coalesce(pp.reveal_policy, 'never') as reveal_policy,
    g.guessed_value as viewer_guess,
    g.is_correct as viewer_guess_is_correct,
    pp.created_at
  from public.profile_prompts pp
  left join public.profile_prompt_guesses g
    on g.profile_prompt_id = pp.id
   and g.viewer_profile_id = v_authorized_viewer
  where pp.profile_id = p_profile_id
  order by pp.created_at desc;
end;
$$;

grant execute on function public.get_viewed_profile_prompts(uuid, uuid) to anon, authenticated;

create or replace function public.submit_profile_prompt_guess(
  p_prompt_id uuid,
  p_viewer_profile_id uuid,
  p_guess text
)
returns table (
  is_correct boolean,
  revealed_answer text,
  viewer_guess text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_authorized_viewer uuid;
  v_prompt record;
  v_normalized_guess text;
  v_normalized_answer text;
  v_is_correct boolean;
begin
  select p.id
    into v_authorized_viewer
  from public.profiles p
  where p.id = p_viewer_profile_id
    and p.user_id = auth.uid()
  limit 1;

  if v_authorized_viewer is null then
    raise exception 'viewer_not_authorized';
  end if;

  select
    pp.id,
    pp.profile_id,
    coalesce(pp.prompt_type, 'standard') as prompt_type,
    pp.answer,
    pp.normalized_answer,
    coalesce(pp.reveal_policy, 'never') as reveal_policy
  into v_prompt
  from public.profile_prompts pp
  where pp.id = p_prompt_id
  limit 1;

  if v_prompt.id is null then
    raise exception 'prompt_not_found';
  end if;

  if v_prompt.prompt_type <> 'guess' then
    raise exception 'prompt_not_guess';
  end if;

  v_normalized_guess := regexp_replace(lower(trim(coalesce(p_guess, ''))), '[^[:alnum:][:space:]]', '', 'g');
  v_normalized_guess := regexp_replace(v_normalized_guess, '\s+', ' ', 'g');

  v_normalized_answer := coalesce(
    v_prompt.normalized_answer,
    regexp_replace(
      regexp_replace(lower(trim(coalesce(v_prompt.answer, ''))), '[^[:alnum:][:space:]]', '', 'g'),
      '\s+',
      ' ',
      'g'
    )
  );

  v_is_correct := v_normalized_guess <> '' and v_normalized_guess = v_normalized_answer;

  insert into public.profile_prompt_guesses (
    profile_prompt_id,
    target_profile_id,
    viewer_profile_id,
    guessed_value,
    normalized_guess,
    is_correct,
    attempts_count
  )
  values (
    v_prompt.id,
    v_prompt.profile_id,
    v_authorized_viewer,
    trim(coalesce(p_guess, '')),
    v_normalized_guess,
    v_is_correct,
    1
  )
  on conflict (profile_prompt_id, viewer_profile_id)
  do update set
    guessed_value = excluded.guessed_value,
    normalized_guess = excluded.normalized_guess,
    is_correct = excluded.is_correct,
    attempts_count = public.profile_prompt_guesses.attempts_count + 1,
    updated_at = now();

  return query
  select
    v_is_correct,
    case
      when v_prompt.reveal_policy = 'after_correct' and v_is_correct then v_prompt.answer
      else ''
    end as revealed_answer,
    trim(coalesce(p_guess, '')) as viewer_guess;
end;
$$;

grant execute on function public.submit_profile_prompt_guess(uuid, uuid, text) to authenticated;
