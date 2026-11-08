-- Human-selected Relationship Gist covers. Assets remain revision-scoped and
-- private; only editors with both draft and quality authority may finalize one.
begin;

alter table public.relationship_gist_revision_images
  alter column generation_job_id drop not null,
  add column if not exists source text not null default 'ai'
    check (source in ('ai', 'manual'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.relationship_gist_revision_images'::regclass
      and conname = 'relationship_gist_revision_images_source_contract'
  ) then
    alter table public.relationship_gist_revision_images
      add constraint relationship_gist_revision_images_source_contract check (
        (source = 'ai' and generation_job_id is not null and sha256 is not null)
        or (source = 'manual' and generation_job_id is null and sha256 is not null)
      );
  end if;
end;
$$;

create or replace function public.relationship_gist_can_upload_manual_cover(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select auth.uid() is not null
    and (storage.foldername(p_storage_path))[1] = auth.uid()::text
    and public.has_relationship_gist_editorial_capability('draft', auth.uid())
    and public.has_relationship_gist_editorial_capability('quality_approve', auth.uid())
    and exists (
      select 1 from public.relationship_gist_revisions revision
      where revision.id::text = (storage.foldername(p_storage_path))[2]
        and revision.status in ('draft', 'in_review')
    );
$$;

revoke all on function public.relationship_gist_can_upload_manual_cover(text) from public, anon;
grant execute on function public.relationship_gist_can_upload_manual_cover(text) to authenticated, service_role;

create or replace function public.relationship_gist_can_cleanup_manual_cover(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.relationship_gist_can_upload_manual_cover(p_storage_path)
    and not exists (
      select 1 from public.relationship_gist_revision_images image
      where image.storage_path = p_storage_path
    );
$$;

revoke all on function public.relationship_gist_can_cleanup_manual_cover(text) from public, anon;
grant execute on function public.relationship_gist_can_cleanup_manual_cover(text) to authenticated, service_role;

drop policy if exists relationship_gist_cover_editor_upload on storage.objects;
create policy relationship_gist_cover_editor_upload on storage.objects
for insert to authenticated
with check (
  bucket_id = 'relationship-gist-covers'
  and public.relationship_gist_can_upload_manual_cover(name)
);

drop policy if exists relationship_gist_cover_editor_cleanup on storage.objects;
create policy relationship_gist_cover_editor_cleanup on storage.objects
for delete to authenticated
using (
  bucket_id = 'relationship-gist-covers'
  and public.relationship_gist_can_cleanup_manual_cover(name)
);

create or replace function public.rpc_finalize_relationship_gist_manual_cover(
  p_revision_id uuid,
  p_perspective text,
  p_storage_path text,
  p_sha256 text,
  p_alt_text text,
  p_width integer,
  p_height integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_revision public.relationship_gist_revisions%rowtype;
  v_object storage.objects%rowtype;
  v_image public.relationship_gist_revision_images%rowtype;
  v_perspective text := lower(btrim(coalesce(p_perspective, '')));
  v_alt_text text := btrim(coalesce(p_alt_text, ''));
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('draft', v_actor)
    or not public.has_relationship_gist_editorial_capability('quality_approve', v_actor) then
    raise exception 'editorial_manual_cover_forbidden' using errcode = '42501';
  end if;
  if char_length(v_alt_text) not between 10 and 300 then raise exception 'gist_manual_cover_alt_text_invalid'; end if;
  if lower(coalesce(p_sha256, '')) !~ '^[a-f0-9]{64}$' then raise exception 'gist_manual_cover_sha256_invalid'; end if;
  if p_width not between 320 and 4096 or p_height not between 200 and 4096 then
    raise exception 'gist_manual_cover_dimensions_invalid';
  end if;
  if p_storage_path !~ ('^' || v_actor::text || '/' || p_revision_id::text || '/[a-f0-9-]{36}[.]webp$') then
    raise exception 'gist_manual_cover_path_invalid' using errcode = '42501';
  end if;

  select * into v_revision from public.relationship_gist_revisions
  where id = p_revision_id for update;
  if v_revision.id is null then raise exception 'gist_revision_not_found'; end if;
  if v_revision.status not in ('draft', 'in_review') then raise exception 'gist_revision_immutable'; end if;
  if not exists (
    select 1 from public.relationship_gist_revision_variants variant
    where variant.revision_id = p_revision_id and variant.perspective = v_perspective
  ) then raise exception 'gist_perspective_not_found'; end if;

  select * into v_object from storage.objects object
  where object.bucket_id = 'relationship-gist-covers'
    and object.name = p_storage_path
    and object.owner_id::text = v_actor::text;
  if v_object.id is null then raise exception 'gist_manual_cover_upload_not_found'; end if;
  if lower(coalesce(v_object.metadata->>'mimetype', '')) <> 'image/webp' then
    raise exception 'gist_manual_cover_mime_invalid';
  end if;
  if coalesce((v_object.metadata->>'size')::bigint, 0) <= 0
    or coalesce((v_object.metadata->>'size')::bigint, 0) > 8388608 then
    raise exception 'gist_manual_cover_size_invalid';
  end if;

  update public.relationship_gist_revision_images
  set status = 'superseded', updated_at = v_now
  where revision_id = p_revision_id and perspective = v_perspective and status = 'approved';

  insert into public.relationship_gist_revision_images(
    revision_id, perspective, generation_job_id, status, storage_path,
    width, height, sha256, alt_text, prompt, generated_by_user_id,
    approved_by_user_id, approved_at, source, created_at, updated_at
  ) values (
    p_revision_id, v_perspective, null, 'approved', p_storage_path,
    p_width, p_height, lower(p_sha256), v_alt_text,
    'Manual editorial upload selected by an authorized human editor.',
    v_actor, v_actor, v_now, 'manual', v_now, v_now
  ) returning * into v_image;

  perform public.relationship_gist_v2_record_audit(
    v_revision.edition_id, v_revision.id, v_actor, 'manual_cover_approved',
    v_revision.status, v_revision.status, null,
    jsonb_build_object('image_id', v_image.id, 'perspective', v_perspective, 'source', 'manual')
  );

  return jsonb_build_object(
    'image_id', v_image.id, 'revision_id', v_revision.id,
    'perspective', v_perspective, 'status', 'approved', 'source', 'manual'
  );
end;
$$;

revoke all on function public.rpc_finalize_relationship_gist_manual_cover(uuid,text,text,text,text,integer,integer)
  from public, anon;
grant execute on function public.rpc_finalize_relationship_gist_manual_cover(uuid,text,text,text,text,integer,integer)
  to authenticated, service_role;

commit;
