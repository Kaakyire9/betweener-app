// @ts-nocheck
// Edge Function: send Expo push notifications
// @deno-types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type PushRequest = {
  user_id: string
  title: string
  body: string
  data?: Record<string, unknown>
}

const asString = (v: unknown): string | null => {
  if (typeof v === 'string') return v
  return null
}

// Use the Expo Push Service "richContent.image" field when available.
// Android renders this out of the box; iOS requires a Notification Service Extension
// (still safe to send without the extension - iOS will just ignore the image).
const getRichImageUrl = (data?: Record<string, unknown>): string | null => {
  if (!data) return null
  const avatar = asString((data as any).avatar_url) || asString((data as any).avatarUrl)
  if (avatar && /^https?:\/\//i.test(avatar)) return avatar
  return null
}

const getMessageIdForDeliveryAck = (data?: Record<string, unknown>): string | null => {
  if (!data) return null
  const type = asString((data as any).type)
  const messageId = asString((data as any).message_id)
  if (type !== 'message' || !messageId) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)
    ? messageId
    : null
}

const countAcceptedExpoTickets = (result: unknown): number => {
  const data = (result as any)?.data
  if (Array.isArray(data)) {
    return data.filter((ticket) => ticket?.status === 'ok').length
  }
  if (data && typeof data === 'object') {
    return data.status === 'ok' ? 1 : 0
  }
  return 0
}

const acknowledgePushDelivered = async (
  service: ReturnType<typeof createClient>,
  messageId: string | null,
  receiverId: string,
) => {
  if (!messageId || !receiverId) return { acked: false, error: null }
  const { error } = await service
    .from('messages')
    .update({ delivered_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('receiver_id', receiverId)
    .is('delivered_at', null)
  if (error) {
    console.log('push-notifications delivery ack error', {
      message_id: messageId,
      receiver_id: receiverId,
      error,
    })
    return { acked: false, error: error.message || 'delivery_ack_failed' }
  }
  return { acked: true, error: null }
}

const getUserBadgeCount = async (
  service: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> => {
  const unreadMessages = await service
    .from('messages')
    .select('sender_id')
    .eq('receiver_id', userId)
    .eq('is_read', false)
    .limit(500)

  const unreadChatSenders = new Set<string>()
  if (!unreadMessages.error && Array.isArray(unreadMessages.data)) {
    unreadMessages.data.forEach((row) => {
      if (typeof row?.sender_id === 'string') unreadChatSenders.add(row.sender_id)
    })
  }

  const pendingIntents = await service
    .from('intent_requests')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())

  return Math.max(0, unreadChatSenders.size + (pendingIntents.count ?? 0))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const secret = (Deno.env.get('PUSH_WEBHOOK_SECRET') || '').trim()
    if (secret) {
      const url = new URL(req.url)
      const headerSecret = req.headers.get('x-push-secret')
      const querySecret =
        url.searchParams.get('x-push-secret') ??
        url.searchParams.get('secret')
      const providedSecret = (headerSecret || querySecret || '').trim()
      if (!providedSecret || providedSecret !== secret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const rawBody = await req.text()
    let payload: PushRequest | null = null
    try {
      payload = JSON.parse(rawBody || '{}')
    } catch (_e) {
      return new Response(JSON.stringify({
        error: 'Invalid JSON body',
        details: {
          rawBodyLength: rawBody?.length ?? 0,
          rawBodyPrefix: (rawBody || '').slice(0, 80),
        },
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('push-notifications payload', payload)
    if (!payload?.user_id || !payload?.title || !payload?.body) {
      const keys =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? Object.keys(payload as any).slice(0, 30)
          : null
      return new Response(JSON.stringify({
        error: 'user_id, title, body are required',
        details: {
          parsedType: Array.isArray(payload) ? 'array' : typeof payload,
          keys,
          rawBodyLength: rawBody?.length ?? 0,
        },
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim()
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({
        error: 'Missing Supabase env vars',
        details: {
          hasUrl: Boolean(supabaseUrl),
          hasServiceRoleKey: Boolean(supabaseServiceKey),
          // Helps catch common misconfiguration in the dashboard.
          hint: 'Set SUPABASE_SERVICE_ROLE_KEY as an Edge Function secret for push-notifications.',
        },
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const service = createClient(supabaseUrl, supabaseServiceKey)

    // The database historically sent profile IDs in some places; tolerate that here by
    // falling back to profiles.id -> profiles.user_id when no tokens exist for the given id.
    let effectiveUserId = payload.user_id

    let { data: tokens, error } = await service
      .from('push_tokens')
      .select('token')
      .eq('user_id', effectiveUserId)

    if (error) {
      console.log('push-notifications token query error', error)
      return new Response(JSON.stringify({
        error: 'Unable to load tokens',
        details: { message: error.message, code: (error as any).code ?? null },
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!tokens?.length) {
      const { data: profileRow, error: profileErr } = await service
        .from('profiles')
        .select('user_id')
        .eq('id', effectiveUserId)
        .maybeSingle()

      if (!profileErr && profileRow?.user_id) {
        effectiveUserId = profileRow.user_id
        const retry = await service
          .from('push_tokens')
          .select('token')
          .eq('user_id', effectiveUserId)
        if (!retry.error) tokens = retry.data
      }
    }

    console.log('push-notifications tokens', {
      user_id: payload.user_id,
      effective_user_id: effectiveUserId,
      count: tokens?.length ?? 0,
    })

    const data = { ...(payload.data || {}) }
    const type = asString((data as any).type) || 'generic'
    const messageIdForDeliveryAck = getMessageIdForDeliveryAck(data)
    const deliveryAckOnly = Boolean((data as any).delivery_ack_only)
    const richImageUrl = getRichImageUrl(data)
    const badge = await getUserBadgeCount(service, effectiveUserId).catch((error) => {
      console.log('push-notifications badge count error', {
        effective_user_id: effectiveUserId,
        error: String((error as any)?.message || error || 'badge_count_error'),
      })
      return null
    })
    if (richImageUrl && !(data as any).image) {
      // Make the URL available to the iOS Notification Service Extension.
      ;(data as any).image = richImageUrl
    }

    const expoMessages = (tokens || []).map((row) => {
      const msg: Record<string, unknown> = {
        to: row.token,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        // Make chat-style notifications feel consistent on Android.
        channelId: type === 'message' || type === 'message_reaction' ? 'messages' : 'default',
        data,
      }
      if (typeof badge === 'number') {
        msg.badge = badge
      }

      // Rich push: image preview + better UX on Android.
      // On iOS this requires a Notification Service Extension to actually display the image.
      if (richImageUrl) {
        msg.richContent = { image: richImageUrl }
        msg.mutableContent = true
      }

      // Category IDs enable interactive notifications (actions). Safe to include even if
      // the app has not registered the category yet.
      msg.categoryId = `bt_${type}`

      return msg
    })

    if (deliveryAckOnly && messageIdForDeliveryAck) {
      const deliveryAck = await acknowledgePushDelivered(service, messageIdForDeliveryAck, effectiveUserId)
      return new Response(JSON.stringify({ ok: true, sent: 0, deliveryAck, debug: 'delivery_ack_only' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!expoMessages.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(expoMessages),
    })
    const result = await expoResponse.json()
    console.log('push-notifications expo result', result)
    const acceptedTickets = countAcceptedExpoTickets(result)
    const deliveryAck =
      messageIdForDeliveryAck && acceptedTickets > 0
        ? await acknowledgePushDelivered(service, messageIdForDeliveryAck, effectiveUserId)
        : { acked: false, error: null }

    return new Response(JSON.stringify({ ok: true, result, acceptedTickets, deliveryAck }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('push-notifications error', error)
    return new Response(JSON.stringify({ error: 'Server error', details: String((error as any)?.message || error || 'unknown') }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
