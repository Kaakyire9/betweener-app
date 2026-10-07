export const PUSH_WEBHOOK_MAX_BODY_BYTES = 160
export const PUSH_WEBHOOK_REPLAY_WINDOW_SECONDS = 180

export type PushWebhookKey = {
  keyId: string
  secret: string
}

export type PushWebhookRequest = {
  event_id: string
}

export type PushWebhookVerificationFailure =
  | 'body_too_large'
  | 'invalid_content_type'
  | 'invalid_key_id'
  | 'invalid_signature'
  | 'invalid_timestamp'
  | 'stale_request'
  | 'unknown_key'

export type PushWebhookVerification =
  | { ok: true; keyId: string; timestamp: number }
  | { ok: false; reason: PushWebhookVerificationFailure }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i

const encoder = new TextEncoder()

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

const timingSafeEqualHex = (left: string, right: string): boolean => {
  const normalizedLeft = left.toLowerCase()
  const normalizedRight = right.toLowerCase()
  const length = Math.max(normalizedLeft.length, normalizedRight.length, 64)
  let difference = normalizedLeft.length ^ normalizedRight.length
  for (let index = 0; index < length; index += 1) {
    difference |= (normalizedLeft.charCodeAt(index) || 0) ^ (normalizedRight.charCodeAt(index) || 0)
  }
  return difference === 0
}

export const signPushWebhookBody = async (
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  )
  return bytesToHex(new Uint8Array(signature))
}

export const verifyPushWebhookRequest = async ({
  contentType,
  keyId,
  signature,
  timestamp,
  rawBody,
  keys,
  nowSeconds = Math.floor(Date.now() / 1000),
  replayWindowSeconds = PUSH_WEBHOOK_REPLAY_WINDOW_SECONDS,
}: {
  contentType: string | null
  keyId: string | null
  signature: string | null
  timestamp: string | null
  rawBody: string
  keys: PushWebhookKey[]
  nowSeconds?: number
  replayWindowSeconds?: number
}): Promise<PushWebhookVerification> => {
  if (!contentType?.toLowerCase().startsWith('application/json')) {
    return { ok: false, reason: 'invalid_content_type' }
  }
  if (encoder.encode(rawBody).byteLength > PUSH_WEBHOOK_MAX_BODY_BYTES) {
    return { ok: false, reason: 'body_too_large' }
  }
  if (!keyId || !KEY_ID_PATTERN.test(keyId)) {
    return { ok: false, reason: 'invalid_key_id' }
  }
  if (!signature || !SIGNATURE_PATTERN.test(signature)) {
    return { ok: false, reason: 'invalid_signature' }
  }
  if (!timestamp || !/^\d{10}$/.test(timestamp)) {
    return { ok: false, reason: 'invalid_timestamp' }
  }

  const parsedTimestamp = Number(timestamp)
  if (!Number.isSafeInteger(parsedTimestamp)) {
    return { ok: false, reason: 'invalid_timestamp' }
  }
  if (Math.abs(nowSeconds - parsedTimestamp) > replayWindowSeconds) {
    return { ok: false, reason: 'stale_request' }
  }

  const signingKey = keys.find((candidate) => candidate.keyId === keyId)
  if (!signingKey) {
    return { ok: false, reason: 'unknown_key' }
  }
  const expected = await signPushWebhookBody(signingKey.secret, timestamp, rawBody)
  if (!timingSafeEqualHex(signature, expected)) {
    return { ok: false, reason: 'invalid_signature' }
  }

  return { ok: true, keyId, timestamp: parsedTimestamp }
}

export const parsePushWebhookBody = (rawBody: string): PushWebhookRequest | null => {
  let value: unknown
  try {
    value = JSON.parse(rawBody)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 1 || typeof record.event_id !== 'string') return null
  if (!UUID_PATTERN.test(record.event_id)) return null
  return { event_id: record.event_id }
}
