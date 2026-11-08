-- Read-only readiness inventory for authenticated Phase B staging canaries.
-- Returns aggregate counts only; no user identity or private session data.

select jsonb_build_object(
  'configuration', (
    select jsonb_build_object(
      'studioEnabled', config.betweener_studio_enabled,
      'studioControlEnabled', config.betweener_studio_control_enabled,
      'sessionDiscoveryEnabled', config.studio_session_discovery_enabled,
      'mediaPublishingEnabled', config.studio_media_publishing_enabled,
      'screenShareEnabled', config.screen_share_enabled,
      'screenAudioEnabled', config.studio_screen_audio_enabled,
      'externalAudioEnabled', config.studio_external_audio_enabled,
      'closedBeta', config.studio_closed_beta
    )
    from public.live_odo_configuration config
    where config.id = true
  ),
  'activeAccessByRole', coalesce((
    select jsonb_object_agg(role_counts.operator_role, role_counts.user_count)
    from (
      select access.operator_role, count(*) as user_count
      from public.live_studio_access access
      where access.allowed
        and (access.expires_at is null or access.expires_at > timezone('utc', now()))
      group by access.operator_role
      order by access.operator_role
    ) role_counts
  ), '{}'::jsonb),
  'verifiedTotpAccessByRole', coalesce((
    select jsonb_object_agg(role_counts.operator_role, role_counts.user_count)
    from (
      select access.operator_role, count(distinct access.user_id) as user_count
      from public.live_studio_access access
      join auth.mfa_factors factor
        on factor.user_id = access.user_id
       and factor.factor_type = 'totp'
       and factor.status = 'verified'
      where access.allowed
        and (access.expires_at is null or access.expires_at > timezone('utc', now()))
      group by access.operator_role
      order by access.operator_role
    ) role_counts
  ), '{}'::jsonb),
  'eligibleSessionCounts', coalesce((
    select jsonb_object_agg(session_counts.status, session_counts.session_count)
    from (
      select session.status, count(*) as session_count
      from public.live_sessions session
      where session.status in ('scheduled', 'confirmed', 'backstage', 'live')
      group by session.status
      order by session.status
    ) session_counts
  ), '{}'::jsonb),
  'activeOperatorCount', (
    select count(*)
    from public.live_studio_access access
    where access.allowed
      and (access.expires_at is null or access.expires_at > timezone('utc', now()))
  ),
  'verifiedTotpOperatorCount', (
    select count(distinct access.user_id)
    from public.live_studio_access access
    join auth.mfa_factors factor
      on factor.user_id = access.user_id
     and factor.factor_type = 'totp'
     and factor.status = 'verified'
    where access.allowed
      and (access.expires_at is null or access.expires_at > timezone('utc', now()))
  ),
  'verifiedTotpUserCount', (
    select count(distinct factor.user_id)
    from auth.mfa_factors factor
    where factor.factor_type = 'totp'
      and factor.status = 'verified'
  ),
  'verifiedTotpAdminCount', (
    select count(distinct admin.user_id)
    from public.internal_admins admin
    join auth.mfa_factors factor
      on factor.user_id = admin.user_id
     and factor.factor_type = 'totp'
     and factor.status = 'verified'
  )
) as phase_b_canary_readiness;
