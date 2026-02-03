-- Profile prompts (multi-answer) table
create table if not exists public.profile_prompts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  prompt_key text not null,
  prompt_title text,
  answer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profile_prompts_profile_id_idx
  on public.profile_prompts (profile_id);
create index if not exists profile_prompts_prompt_key_idx
  on public.profile_prompts (prompt_key);
create index if not exists profile_prompts_created_at_idx
  on public.profile_prompts (created_at desc);

-- updated_at trigger
create or replace function public.set_profile_prompts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profile_prompts_set_updated_at on public.profile_prompts;
create trigger profile_prompts_set_updated_at
before update on public.profile_prompts
for each row execute function public.set_profile_prompts_updated_at();

-- RLS
alter table public.profile_prompts enable row level security;

-- Public read (2A)
drop policy if exists "profile_prompts_select_public" on public.profile_prompts;
create policy "profile_prompts_select_public"
on public.profile_prompts
for select
to public
using (true);

-- Owner insert/update/delete
drop policy if exists "profile_prompts_insert_owner" on public.profile_prompts;
create policy "profile_prompts_insert_owner"
on public.profile_prompts
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = profile_prompts.profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "profile_prompts_update_owner" on public.profile_prompts;
create policy "profile_prompts_update_owner"
on public.profile_prompts
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_prompts.profile_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = profile_prompts.profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "profile_prompts_delete_owner" on public.profile_prompts;
create policy "profile_prompts_delete_owner"
on public.profile_prompts
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = profile_prompts.profile_id
      and p.user_id = auth.uid()
  )
);
