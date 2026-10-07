-- Move only the staging push application identity to Betweener S's dedicated Expo/EAS project.

update private.push_application_config
set expo_project_id = '7f38a835-2da7-419b-a20b-e1a12e021547'::uuid,
    updated_at = timezone('utc', now())
where app_environment = 'staging'
  and application_id = 'com.aduboffour.betweener.staging';

update public.push_tokens
set provenance_status = 'quarantined',
    quarantined_at = coalesce(quarantined_at, timezone('utc', now())),
    quarantine_reason = case
      when quarantine_reason = 'PUSH_TOKEN_SHARED_ACROSS_ENVIRONMENTS'
        then quarantine_reason
      else 'PUSH_PROJECT_ID_MISMATCH'
    end,
    updated_at = timezone('utc', now())
where app_environment = 'staging'
  and expo_project_id is distinct from '7f38a835-2da7-419b-a20b-e1a12e021547'::uuid;
