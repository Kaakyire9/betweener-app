// Proposed operator commands, never executed here. Scope B approval is required.
// No credentials, clients, scheduler changes, job deletion or provider calls.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const quote=v=>`'${String(v).replaceAll("'","''")}'`;
const emergencyStopSql=`begin;
do $$ begin
  if not exists(select 1 from private.connect_config where singleton and environment='staging') then raise exception 'pilot_staging_required'; end if;
  update private.connect_config set enabled=false,voice_enabled=false,video_enabled=false,pre_match_enabled=false,
    provider_ready=false,end_block_enabled=false,notifications_enabled=false,staging_open_testing=false,staging_calls_remaining=0 where singleton;
end $$;
commit;`;
function ownedEndSql(binding,{watchdog=false}={}){
  const media=binding.media??'voice';
  if(!['voice','video'].includes(media))throw Error('pilot_binding_invalid');
  for(const key of ['id','callerUser','recipientUser','callerProfile','recipientProfile'])if(!uuid.test(binding[key]??''))throw Error('pilot_binding_invalid');
  if(binding.callerUser===binding.recipientUser||binding.callerProfile===binding.recipientProfile||!/^[0-9T:Z+.\-]+$/.test(binding.createdAt??'')||!Number.isFinite(Date.parse(binding.createdAt))||(binding.providerSession!==null&&(typeof binding.providerSession!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(binding.providerSession))))throw Error('pilot_binding_invalid');
  return `begin;
do $$ declare s private.connect_sessions; begin
  if not exists(select 1 from private.connect_config where singleton and environment='staging') then raise exception 'pilot_staging_required'; end if;
  perform private.relationship_lock_pair(${quote(binding.callerProfile)}::uuid,${quote(binding.recipientProfile)}::uuid);
  select * into strict s from private.connect_sessions where id=${quote(binding.id)}::uuid for update;
  if s.created_at is distinct from ${quote(binding.createdAt)}::timestamptz or s.caller_user_id<>${quote(binding.callerUser)}::uuid
    or s.recipient_user_id<>${quote(binding.recipientUser)}::uuid or s.caller_profile_id<>${quote(binding.callerProfile)}::uuid
    or s.recipient_profile_id<>${quote(binding.recipientProfile)}::uuid or s.media<>${quote(media)} or s.auth_mode<>'matched'
    or s.provider_session_id is distinct from ${binding.providerSession===null?'null::text':quote(binding.providerSession)} then raise exception 'pilot_ownership_mismatch'; end if;
  if s.ended_at is not null or s.state='ENDING' then return; end if;
  ${watchdog?"if s.connected_at is null then raise exception 'pilot_connection_time_unverified'; end if;\n  if s.connected_at>clock_timestamp()-interval '90 seconds' then return; end if;":''}
  perform private.connect_transition(s.id,case when s.state in ('REQUESTED','RINGING') then 'CANCELLED' else 'ENDING' end,${quote(watchdog?'pilot_watchdog':'pilot_emergency_stop')});
end $$;
commit;`;
}
module.exports={emergencyStopSql,ownedEndSql};
