create or replace function public.notify_moment_comment_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_moment record;
  v_parent_comment_user_id uuid;
  v_owner_profile_id uuid;
  v_actor_profile_id uuid;
  v_actor_name text;
  v_actor_avatar text;
  v_comment_snippet text;
  v_recipient record;
  v_preview_text boolean;
  v_inapp_enabled boolean;
  v_push_enabled boolean;
  v_moments_enabled boolean;
  v_relationship_cue text;
  v_cue_lead text;
  v_inbox_body text;
  v_push_body text;
begin
  select m.id, m.user_id, m.type, m.caption, m.text_body, m.expires_at, m.is_deleted
    into v_moment
  from public.moments m
  where m.id = new.moment_id
  limit 1;

  if not found
     or v_moment.user_id is null
     or coalesce(v_moment.is_deleted, false)
     or coalesce(new.is_deleted, false)
     or v_moment.expires_at <= timezone('utc'::text, now()) then
    return new;
  end if;

  if new.parent_comment_id is not null then
    select c.user_id
      into v_parent_comment_user_id
    from public.moment_comments c
    where c.id = new.parent_comment_id
      and coalesce(c.is_deleted, false) = false
    limit 1;
  end if;

  select p.id
    into v_owner_profile_id
  from public.profiles p
  where p.user_id = v_moment.user_id
  limit 1;

  select p.id, p.full_name, p.avatar_url
    into v_actor_profile_id, v_actor_name, v_actor_avatar
  from public.profiles p
  where p.user_id = new.user_id
  limit 1;

  v_actor_name := coalesce(nullif(btrim(v_actor_name), ''), 'Someone');
  v_comment_snippet := left(regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g'), 120);

  for v_recipient in
    with recipients as (
      select
        v_moment.user_id as recipient_user_id,
        v_owner_profile_id as recipient_profile_id,
        'moment_owner'::text as recipient_kind
      union all
      select
        v_parent_comment_user_id as recipient_user_id,
        parent_profile.id as recipient_profile_id,
        'reply_target'::text as recipient_kind
      from public.profiles parent_profile
      where v_parent_comment_user_id is not null
        and parent_profile.user_id = v_parent_comment_user_id
    )
    select distinct on (recipient_user_id)
      recipient_user_id,
      recipient_profile_id,
      recipient_kind
    from recipients
    where recipient_user_id is not null
      and recipient_user_id <> new.user_id
    order by recipient_user_id, case recipient_kind when 'moment_owner' then 0 else 1 end
  loop
    if exists (
      select 1
      from public.blocks b
      where (b.blocker_id = v_recipient.recipient_user_id and b.blocked_id = new.user_id)
         or (b.blocker_id = new.user_id and b.blocked_id = v_recipient.recipient_user_id)
    ) then
      continue;
    end if;

    v_preview_text := true;
    v_inapp_enabled := true;
    v_push_enabled := true;
    v_moments_enabled := true;

    select
      coalesce(p.preview_text, true),
      coalesce(p.inapp_enabled, true),
      coalesce(p.push_enabled, true),
      coalesce(p.moments, true)
      into
        v_preview_text,
        v_inapp_enabled,
        v_push_enabled,
        v_moments_enabled
    from public.notification_prefs p
    where p.user_id = v_recipient.recipient_user_id
    limit 1;

    v_relationship_cue := public.get_moment_relationship_cue(
      v_recipient.recipient_profile_id,
      v_actor_profile_id
    );
    v_cue_lead := case v_relationship_cue
      when 'You matched' then 'Your match'
      when 'Door reopened' then 'A reopened connection'
      when 'Liked you' then 'Someone who liked you'
      when 'You liked each other' then 'Someone you both noticed'
      when 'You liked them' then 'Someone on your radar'
      when 'You reached out' then 'Someone you reached out to'
      when 'They reached out' then 'Someone who reached out'
      else null
    end;

    v_inbox_body := case
      when v_recipient.recipient_kind = 'reply_target' then
        case
          when coalesce(v_preview_text, true) = false then
            case
              when v_cue_lead is not null then v_cue_lead || ' replied to your comment'
              else 'Replied to your comment'
            end
          when nullif(btrim(coalesce(v_comment_snippet, '')), '') is not null then
            case
              when v_cue_lead is not null then v_cue_lead || ' replied: "' || v_comment_snippet || '"'
              else 'Replied: "' || v_comment_snippet || '"'
            end
          else
            case
              when v_cue_lead is not null then v_cue_lead || ' replied to your comment'
              else 'Replied to your comment'
            end
        end
      else
        case
          when coalesce(v_preview_text, true) = false then
            case
              when v_cue_lead is not null then v_cue_lead || ' commented on your Moment'
              else 'Commented on your Moment'
            end
          when nullif(btrim(coalesce(v_comment_snippet, '')), '') is not null then
            case
              when v_cue_lead is not null then v_cue_lead || ' commented: "' || v_comment_snippet || '"'
              else 'Commented: "' || v_comment_snippet || '"'
            end
          else
            case
              when v_cue_lead is not null then v_cue_lead || ' commented on your Moment'
              else 'Commented on your Moment'
            end
        end
    end;

    if v_moments_enabled and v_inapp_enabled then
      insert into public.inbox_items (
        user_id,
        type,
        actor_id,
        entity_id,
        entity_type,
        title,
        body,
        action_required,
        metadata
      )
      values (
        v_recipient.recipient_user_id,
        'MOMENT_COMMENT',
        v_actor_profile_id,
        v_moment.id,
        'moment',
        v_actor_name,
        v_inbox_body,
        true,
        jsonb_strip_nulls(
          jsonb_build_object(
            'comment_id', new.id,
            'parent_comment_id', new.parent_comment_id,
            'moment_id', v_moment.id,
            'moment_owner_user_id', v_moment.user_id,
            'moment_type', v_moment.type,
            'name', v_actor_name,
            'avatar_url', v_actor_avatar,
            'relationship_cue', v_relationship_cue,
            'recipient_kind', v_recipient.recipient_kind,
            'route', '/moments'
          )
        )
      );
    end if;

    if not v_moments_enabled or not v_push_enabled or public.is_quiet_hours(v_recipient.recipient_user_id) then
      continue;
    end if;

    v_push_body := case
      when v_recipient.recipient_kind = 'reply_target' and coalesce(v_preview_text, true) = false then
        'Someone replied to your comment'
      when v_recipient.recipient_kind = 'moment_owner' and coalesce(v_preview_text, true) = false then
        'Someone commented on your Moment'
      else v_inbox_body
    end;

    perform private.send_push_webhook(
      jsonb_build_object(
        'user_id', v_recipient.recipient_user_id,
        'title', v_actor_name,
        'body', v_push_body,
        'data', jsonb_build_object(
          'type', 'moment_comment',
          'comment_id', new.id,
          'parent_comment_id', new.parent_comment_id,
          'moment_id', v_moment.id,
          'profile_id', v_actor_profile_id,
          'name', v_actor_name,
          'avatar_url', v_actor_avatar,
          'relationship_cue', v_relationship_cue,
          'recipient_kind', v_recipient.recipient_kind,
          'moment_owner_user_id', v_moment.user_id,
          'start_user_id', v_moment.user_id,
          'route', '/moments'
        )
      )
    );
  end loop;

  return new;
end;
$$;
