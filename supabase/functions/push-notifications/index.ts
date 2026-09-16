// @ts-nocheck
// Server-only Edge Function: deliver canonical push-notification outbox events.
// @deno-types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"

// eslint-disable-next-line import/no-unresolved -- resolved by the Supabase Deno runtime.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// eslint-disable-next-line import/no-unresolved -- resolved by the Supabase Deno runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  parsePushWebhookBody,
  PUSH_WEBHOOK_MAX_BODY_BYTES,
  PUSH_WEBHOOK_REPLAY_WINDOW_SECONDS,
  type PushWebhookKey,
  verifyPushWebhookRequest,
} from '../_shared/push-webhook-security.ts'
import {
  evaluatePushTokenCompatibility,
  INCOMPATIBLE_APP_VERSION_SUPPRESSION_REASON,
  resolveLiveRoutingMinimumAppVersion,
  selectCompatiblePushTokensForDelivery,
} from '../_shared/push-notification-compatibility.ts'

type PushNotificationEventClaim = {
  claimStatus: 'claimed' | 'duplicate' | 'expired' | 'rate_limited' | 'not_authorized'
  eventId?: string
  deliveryKind?: 'unicast' | 'live_campaign'
  recipientUserId?: string
  campaignId?: string
  eventType?: string
  title?: string
  body?: string
  data?: Record<string, unknown>
}

type LiveNotificationCampaign = {
  id: string
  sessionId: string
  kind: 'starting_soon' | 'live_now'
  title: string
  body: string
  data: Record<string, unknown>
  attemptCount: number
}

type ExpoMessageCandidate = {
  tokenId: string
  message: Record<string, unknown>
}

const LIVE_NOTIFICATIONS_MIN_APP_VERSION = resolveLiveRoutingMinimumAppVersion(
  Deno.env.get('LIVE_NOTIFICATIONS_MIN_APP_VERSION'),
)
const MAX_TOKENS_PER_RECIPIENT = 10
const MAX_CAMPAIGN_TOKENS = 20_000
const CAMPAIGN_PAGE_SIZE = 500
const EXPO_BATCH_SIZE = 100
const EXPO_BATCH_CONCURRENCY = 3
const MINIMUM_SIGNING_SECRET_LENGTH = 43

const jsonResponse = (status: number, payload: Record<string, unknown>, extraHeaders = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })

const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const getRichImageUrl = (data?: Record<string, unknown>): string | null => {
  if (!data) return null
  const avatar = asString(data.avatar_url) || asString(data.avatarUrl)
  if (avatar && /^https?:\/\//i.test(avatar)) return avatar
  return null
}

const getMessageIdForDeliveryAck = (data?: Record<string, unknown>): string | null => {
  if (!data || asString(data.type) !== 'message') return null
  const messageId = asString(data.message_id)
  return messageId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)
    ? messageId
    : null
}

const countAcceptedExpoTickets = (result: unknown): number => {
  const data = (result as any)?.data
  if (Array.isArray(data)) return data.filter((ticket) => ticket?.status === 'ok').length
  return data && typeof data === 'object' && data.status === 'ok' ? 1 : 0
}

const getCompatibilityAwareDeliveryOutcome = (
  reservedTokenCount: number,
  consideredTokenCount: number,
  compatibleTokenCount: number,
  suppressedIncompatibleCount: number,
): string => {
  if (reservedTokenCount > 0) {
    return suppressedIncompatibleCount > 0
      ? 'delivered_with_incompatible_tokens_suppressed'
      : 'delivered'
  }
  if (
    consideredTokenCount > 0
    && compatibleTokenCount === 0
    && suppressedIncompatibleCount > 0
  ) {
    return 'incompatible_app_version_suppressed'
  }
  return 'no_tokens_or_already_reserved'
}

const loadSigningKeys = (): PushWebhookKey[] => {
  const current = {
    keyId: (Deno.env.get('PUSH_HMAC_CURRENT_KEY_ID') || '').trim(),
    secret: (Deno.env.get('PUSH_HMAC_CURRENT_SECRET') || '').trim(),
  }
  const keys = current.keyId && current.secret.length >= MINIMUM_SIGNING_SECRET_LENGTH
    ? [current]
    : []

  const previous = {
    keyId: (Deno.env.get('PUSH_HMAC_PREVIOUS_KEY_ID') || '').trim(),
    secret: (Deno.env.get('PUSH_HMAC_PREVIOUS_SECRET') || '').trim(),
  }
  const previousValidUntil = Number(Deno.env.get('PUSH_HMAC_PREVIOUS_VALID_UNTIL') || '0')
  if (
    previous.keyId
    && previous.secret.length >= MINIMUM_SIGNING_SECRET_LENGTH
    && Number.isSafeInteger(previousValidUntil)
    && previousValidUntil >= Math.floor(Date.now() / 1000)
  ) {
    keys.push(previous)
  }
  return keys
}

const readRequestBody = async (request: Request): Promise<string> => {
  const declaredLength = Number(request.headers.get('content-length') || '0')
  if (Number.isFinite(declaredLength) && declaredLength > PUSH_WEBHOOK_MAX_BODY_BYTES) {
    throw new Error('body_too_large')
  }
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > PUSH_WEBHOOK_MAX_BODY_BYTES) {
      await reader.cancel('body_too_large')
      throw new Error('body_too_large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
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
    console.warn('push-notifications delivery acknowledgement failed', {
      event: 'delivery_ack_failed',
      message_id: messageId,
      receiver_id: receiverId,
      error_code: error.code || null,
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

const sendExpoBatches = async (
  service: ReturnType<typeof createClient>,
  eventId: string,
  candidates: ExpoMessageCandidate[],
): Promise<{ acceptedTickets: number; reservedTokens: number }> => {
  const batches: ExpoMessageCandidate[][] = []
  for (let index = 0; index < candidates.length; index += EXPO_BATCH_SIZE) {
    batches.push(candidates.slice(index, index + EXPO_BATCH_SIZE))
  }

  let acceptedTickets = 0
  let reservedTokens = 0
  for (let index = 0; index < batches.length; index += EXPO_BATCH_CONCURRENCY) {
    const results = await Promise.all(
      batches.slice(index, index + EXPO_BATCH_CONCURRENCY).map(async (batch) => {
        const { data: reservedRows, error: reservationError } = await service.rpc(
          'rpc_service_reserve_push_notification_deliveries_v1',
          {
            p_event_id: eventId,
            p_token_ids: batch.map((candidate) => candidate.tokenId),
          },
        )
        if (reservationError) {
          throw new Error(`delivery_reservation_failed:${reservationError.code || 'unknown'}`)
        }
        const reservedIds = new Set((reservedRows || []).map((row) => row.reserved_token_id))
        const messages = batch
          .filter((candidate) => reservedIds.has(candidate.tokenId))
          .map((candidate) => candidate.message)
        if (messages.length === 0) return { acceptedTickets: 0, reservedTokens: 0 }

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messages),
        })
        if (!response.ok) throw new Error(`expo_http_${response.status}`)
        const result = await response.json()
        return {
          acceptedTickets: countAcceptedExpoTickets(result),
          reservedTokens: messages.length,
        }
      }),
    )
    acceptedTickets += results.reduce((total, result) => total + result.acceptedTickets, 0)
    reservedTokens += results.reduce((total, result) => total + result.reservedTokens, 0)
  }
  return { acceptedTickets, reservedTokens }
}

const sendLiveNotificationCampaign = async (
  service: ReturnType<typeof createClient>,
  campaignId: string,
  eventId: string,
) => {
  const { data: claimed, error: claimError } = await service.rpc(
    'rpc_service_claim_live_notification_campaign_v1',
    { p_campaign_id: campaignId },
  )
  if (claimError) throw new Error(`campaign_claim_failed:${claimError.code || 'unknown'}`)
  if (!claimed) {
    return {
      skipped: true,
      recipients: 0,
      acceptedTickets: 0,
      suppressedIncompatibleTokens: 0,
    }
  }

  const campaign = claimed as LiveNotificationCampaign
  const countResult = await service
    .from('push_tokens')
    .select('id', { count: 'exact', head: true })
  if (countResult.error) throw new Error(`campaign_token_count_failed:${countResult.error.code || 'unknown'}`)
  if ((countResult.count ?? 0) > MAX_CAMPAIGN_TOKENS) {
    console.warn('push-notifications anomalous campaign volume rejected', {
      event: 'campaign_volume_rejected',
      campaign_id: campaign.id,
      token_count: countResult.count,
      limit: MAX_CAMPAIGN_TOKENS,
    })
    throw new Error('campaign_recipient_limit_exceeded')
  }

  let lastTokenId: string | null = null
  const recipientUserIds = new Set<string>()
  let acceptedTickets = 0
  let scannedTokens = 0
  let suppressedIncompatibleTokens = 0
  const notificationType = `live_${campaign.kind}`

  try {
    while (true) {
      let tokenQuery = service
        .from('push_tokens')
        .select('id,user_id,token,app_version')
        .order('id')
        .limit(CAMPAIGN_PAGE_SIZE)
      if (lastTokenId) tokenQuery = tokenQuery.gt('id', lastTokenId)
      const { data: tokenRows, error: tokenError } = await tokenQuery
      if (tokenError) throw new Error(`campaign_tokens_failed:${tokenError.code || 'unknown'}`)
      if (!tokenRows?.length) break
      scannedTokens += tokenRows.length

      const userIds = [...new Set(tokenRows.map((row) => row.user_id).filter(Boolean))]
      const { data: preferenceRows, error: preferenceError } = await service
        .from('notification_prefs')
        .select('user_id,push_enabled,live_reminders,live_started')
        .in('user_id', userIds)
      if (preferenceError) throw new Error(`campaign_preferences_failed:${preferenceError.code || 'unknown'}`)

      const preferences = new Map((preferenceRows || []).map((row) => [row.user_id, row]))
      const seenTokens = new Set<string>()
      const messages = tokenRows.flatMap((row) => {
        const token = String(row.token || '').trim()
        if (!token || seenTokens.has(token)) return []
        seenTokens.add(token)
        const compatibility = evaluatePushTokenCompatibility(
          notificationType,
          row.app_version,
          LIVE_NOTIFICATIONS_MIN_APP_VERSION,
        )
        if (!compatibility.compatible) {
          suppressedIncompatibleTokens += 1
          return []
        }
        const preference = preferences.get(row.user_id)
        if (preference?.push_enabled === false) return []
        const allowed = campaign.kind === 'starting_soon'
          ? preference?.live_reminders !== false
          : preference?.live_started !== false
        if (!allowed) return []
        recipientUserIds.add(row.user_id)
        return [{
          tokenId: row.id,
          message: {
            to: token,
            sound: 'default',
            title: campaign.title,
            body: campaign.body,
            channelId: 'default',
            categoryId: `bt_live_${campaign.kind}`,
            data: campaign.data || {},
          },
        }]
      })

      const delivery = await sendExpoBatches(service, eventId, messages)
      acceptedTickets += delivery.acceptedTickets
      lastTokenId = tokenRows[tokenRows.length - 1].id
      if (tokenRows.length < CAMPAIGN_PAGE_SIZE) break
    }

    if (suppressedIncompatibleTokens > 0) {
      console.info('push-notifications incompatible tokens suppressed', {
        event: 'notification_tokens_suppressed',
        reason: INCOMPATIBLE_APP_VERSION_SUPPRESSION_REASON,
        notification_type: notificationType,
        suppressed_token_count: suppressedIncompatibleTokens,
        minimum_app_version: LIVE_NOTIFICATIONS_MIN_APP_VERSION,
      })
    }

    const { error: completeError } = await service.rpc(
      'rpc_service_complete_live_notification_campaign_v1',
      {
        p_campaign_id: campaign.id,
        p_succeeded: true,
        p_recipient_count: recipientUserIds.size,
        p_accepted_ticket_count: acceptedTickets,
        p_failure_reason: null,
      },
    )
    if (completeError) throw new Error(`campaign_complete_failed:${completeError.code || 'unknown'}`)
    console.log('push-notifications campaign delivered', {
      event: 'campaign_delivered',
      campaign_id: campaign.id,
      scanned_tokens: scannedTokens,
      recipients: recipientUserIds.size,
      accepted_tickets: acceptedTickets,
    })
    return {
      skipped: false,
      recipients: recipientUserIds.size,
      acceptedTickets,
      suppressedIncompatibleTokens,
    }
  } catch (error) {
    await service.rpc('rpc_service_complete_live_notification_campaign_v1', {
      p_campaign_id: campaign.id,
      p_succeeded: false,
      p_recipient_count: recipientUserIds.size,
      p_accepted_ticket_count: acceptedTickets,
      p_failure_reason: String((error as Error)?.message || 'campaign_delivery_failed'),
    })
    throw error
  }
}

serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' }, { Allow: 'POST' })
  }

  let rawBody = ''
  try {
    rawBody = await readRequestBody(request)
  } catch (error) {
    const reason = (error as Error)?.message === 'body_too_large'
      ? 'body_too_large'
      : 'invalid_body_encoding'
    console.warn('push-notifications request rejected', {
      event: 'authentication_failure',
      reason,
    })
    return jsonResponse(reason === 'body_too_large' ? 413 : 400, { error: 'Request rejected' })
  }

  const signingKeys = loadSigningKeys()
  if (signingKeys.length === 0) {
    console.error('push-notifications signing configuration unavailable', {
      event: 'signing_configuration_unavailable',
    })
    return jsonResponse(503, { error: 'Service unavailable' })
  }

  const verification = await verifyPushWebhookRequest({
    contentType: request.headers.get('content-type'),
    keyId: request.headers.get('x-betweener-key-id'),
    signature: request.headers.get('x-betweener-signature'),
    timestamp: request.headers.get('x-betweener-timestamp'),
    rawBody,
    keys: signingKeys,
    replayWindowSeconds: PUSH_WEBHOOK_REPLAY_WINDOW_SECONDS,
  })
  if (!verification.ok) {
    console.warn('push-notifications request rejected', {
      event: 'authentication_failure',
      reason: verification.reason,
      key_id: request.headers.get('x-betweener-key-id') || null,
      body_bytes: new TextEncoder().encode(rawBody).byteLength,
    })
    return jsonResponse(verification.reason === 'body_too_large' ? 413 : 401, {
      error: 'Unauthorized',
    })
  }

  const payload = parsePushWebhookBody(rawBody)
  if (!payload) {
    console.warn('push-notifications malformed envelope rejected', {
      event: 'malformed_request',
      key_id: verification.keyId,
      body_bytes: new TextEncoder().encode(rawBody).byteLength,
    })
    return jsonResponse(400, { error: 'Malformed request' })
  }

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim()
  const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim()
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('push-notifications database configuration unavailable', {
      event: 'database_configuration_unavailable',
    })
    return jsonResponse(503, { error: 'Service unavailable' })
  }

  const service = createClient(supabaseUrl, supabaseServiceKey)
  const { data: claimData, error: claimError } = await service.rpc(
    'rpc_service_claim_push_notification_event_v1',
    { p_event_id: payload.event_id },
  )
  if (claimError) {
    console.warn('push-notifications event claim rejected', {
      event: 'event_claim_failed',
      event_id: payload.event_id,
      error_code: claimError.code || null,
    })
    return jsonResponse(claimError.code === 'P0002' ? 404 : 500, { error: 'Event unavailable' })
  }

  const claim = claimData as PushNotificationEventClaim
  if (claim?.claimStatus !== 'claimed') {
    const rateLimited = claim?.claimStatus === 'rate_limited'
    console.warn('push-notifications event rejected', {
      event: rateLimited ? 'notification_volume_anomaly' : 'duplicate_or_replay',
      event_id: payload.event_id,
      claim_status: claim?.claimStatus || 'unavailable',
    })
    return jsonResponse(rateLimited ? 429 : 409, {
      error: rateLimited ? 'Rate limit exceeded' : 'Event already handled',
    })
  }

  const completeEvent = async (
    succeeded: boolean,
    recipientCount: number,
    acceptedTicketCount: number,
    outcome: string,
  ) => {
    const result = await service.rpc('rpc_service_complete_push_notification_event_v1', {
      p_event_id: payload.event_id,
      p_succeeded: succeeded,
      p_recipient_count: recipientCount,
      p_accepted_ticket_count: acceptedTicketCount,
      p_outcome: outcome,
    })
    if (result.error || result.data !== true) {
      throw new Error(`event_completion_failed:${result.error?.code || 'not_updated'}`)
    }
  }

  try {
    if (claim.deliveryKind === 'live_campaign' && claim.campaignId) {
      const result = await sendLiveNotificationCampaign(service, claim.campaignId, payload.event_id)
      let campaignOutcome = 'delivered'
      if (result.skipped) campaignOutcome = 'superseded'
      else if (result.suppressedIncompatibleTokens > 0) {
        campaignOutcome = result.acceptedTickets === 0
          ? 'incompatible_app_version_suppressed'
          : 'delivered_with_incompatible_tokens_suppressed'
      }
      await completeEvent(
        true,
        result.recipients,
        result.acceptedTickets,
        campaignOutcome,
      )
      return jsonResponse(200, { ok: true, ...result })
    }

    if (
      claim.deliveryKind !== 'unicast'
      || !claim.recipientUserId
      || !claim.title
      || !claim.body
    ) {
      throw new Error('invalid_canonical_event')
    }

    const data = { ...(claim.data || {}) }
    const type = claim.eventType || asString(data.type) || 'system_message'
    const tokenResult = await service
      .from('push_tokens')
      .select('id,token,last_seen_at,app_version')
      .eq('user_id', claim.recipientUserId)
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .limit(MAX_TOKENS_PER_RECIPIENT + 1)
    if (tokenResult.error) throw new Error(`token_query_failed:${tokenResult.error.code || 'unknown'}`)
    if ((tokenResult.data?.length ?? 0) > MAX_TOKENS_PER_RECIPIENT) {
      console.warn('push-notifications anomalous recipient token volume capped', {
        event: 'recipient_token_volume_capped',
        event_id: payload.event_id,
        recipient_user_id: claim.recipientUserId,
        token_count: tokenResult.data?.length,
        limit: MAX_TOKENS_PER_RECIPIENT,
      })
    }

    const messageId = getMessageIdForDeliveryAck(data)
    const richImageUrl = getRichImageUrl(data)
    const badge = await getUserBadgeCount(service, claim.recipientUserId).catch(() => null)
    if (richImageUrl && !data.image) data.image = richImageUrl

    const tokenSelection = selectCompatiblePushTokensForDelivery(
      tokenResult.data || [],
      MAX_TOKENS_PER_RECIPIENT,
      type,
      LIVE_NOTIFICATIONS_MIN_APP_VERSION,
    )
    if (tokenSelection.suppressedIncompatibleCount > 0) {
      console.info('push-notifications incompatible tokens suppressed', {
        event: 'notification_tokens_suppressed',
        reason: INCOMPATIBLE_APP_VERSION_SUPPRESSION_REASON,
        notification_type: type,
        suppressed_token_count: tokenSelection.suppressedIncompatibleCount,
        minimum_app_version: LIVE_NOTIFICATIONS_MIN_APP_VERSION,
      })
    }

    const messages = tokenSelection.compatibleTokens
      .map((row) => {
        const message: Record<string, unknown> = {
          to: row.token,
          sound: 'default',
          title: claim.title,
          body: claim.body,
          channelId: type === 'message' || type === 'message_reaction' ? 'messages' : 'default',
          categoryId: `bt_${type}`,
          data,
        }
        if (typeof badge === 'number') message.badge = badge
        if (richImageUrl) {
          message.richContent = { image: richImageUrl }
          message.mutableContent = true
        }
        return { tokenId: row.id, message }
      })

    const delivery = await sendExpoBatches(service, payload.event_id, messages)
    const acceptedTickets = delivery.acceptedTickets
    const deliveryAck = messageId && acceptedTickets > 0
      ? await acknowledgePushDelivered(service, messageId, claim.recipientUserId)
      : { acked: false, error: null }
    const deliveryOutcome = getCompatibilityAwareDeliveryOutcome(
      delivery.reservedTokens,
      tokenSelection.consideredTokens.length,
      tokenSelection.compatibleTokens.length,
      tokenSelection.suppressedIncompatibleCount,
    )
    await completeEvent(
      true,
      delivery.reservedTokens > 0 ? 1 : 0,
      acceptedTickets,
      deliveryOutcome,
    )

    console.log('push-notifications event delivered', {
      event: 'notification_event_delivered',
      event_id: payload.event_id,
      event_type: type,
      recipient_count: delivery.reservedTokens > 0 ? 1 : 0,
      accepted_tickets: acceptedTickets,
      suppressed_incompatible_tokens: tokenSelection.suppressedIncompatibleCount,
    })
    return jsonResponse(200, {
      ok: true,
      recipients: delivery.reservedTokens > 0 ? 1 : 0,
      acceptedTickets,
      deliveryAck,
    })
  } catch (error) {
    const reason = String((error as Error)?.message || 'delivery_failed').slice(0, 160)
    await service.rpc('rpc_service_complete_push_notification_event_v1', {
      p_event_id: payload.event_id,
      p_succeeded: false,
      p_recipient_count: 0,
      p_accepted_ticket_count: 0,
      p_outcome: reason,
    })
    console.error('push-notifications delivery failed', {
      event: 'notification_event_failed',
      event_id: payload.event_id,
      reason,
    })
    return jsonResponse(502, { error: 'Delivery failed' })
  }
})
