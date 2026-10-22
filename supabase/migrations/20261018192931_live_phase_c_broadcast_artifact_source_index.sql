begin;

create index if not exists live_broadcast_artifacts_source_artifact_idx
  on public.live_broadcast_artifacts(source_artifact_id)
  where source_artifact_id is not null;

commit;
