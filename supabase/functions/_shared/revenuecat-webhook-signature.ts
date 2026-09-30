const encoder = new TextEncoder();

export type RevenueCatWebhookSignatureResult =
  | { valid: true; timestamp: number }
  | {
      valid: false;
      reason: 'missing_header' | 'malformed_header' | 'timestamp_outside_tolerance' | 'invalid_signature';
    };

const parseHeader = (header: string) => {
  const fields = new Map<string, string>();
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!fields.has(key)) fields.set(key, value);
  }
  return { timestamp: fields.get('t') ?? '', signature: fields.get('v1') ?? '' };
};

const hexToBytes = (value: string) => {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
};

const bytesToHex = (value: Uint8Array) =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');

const constantTimeEqual = (left: Uint8Array, right: Uint8Array) => {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
};

const buildSignedPayload = (timestamp: string, rawBody: Uint8Array) => {
  const prefix = encoder.encode(`${timestamp}.`);
  const value = new Uint8Array(prefix.length + rawBody.length);
  value.set(prefix);
  value.set(rawBody, prefix.length);
  return value;
};

export async function computeRevenueCatWebhookSignature(
  rawBody: Uint8Array,
  timestamp: string,
  secret: string,
) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    buildSignedPayload(timestamp, rawBody),
  );
  return bytesToHex(new Uint8Array(signature));
}

export async function verifyRevenueCatWebhookSignature(args: {
  rawBody: Uint8Array;
  header: string | null;
  secret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): Promise<RevenueCatWebhookSignatureResult> {
  if (!args.header) return { valid: false, reason: 'missing_header' };
  const { timestamp, signature } = parseHeader(args.header);
  if (!/^\d{1,12}$/.test(timestamp)) return { valid: false, reason: 'malformed_header' };
  const receivedSignature = hexToBytes(signature);
  if (!receivedSignature) return { valid: false, reason: 'malformed_header' };

  const timestampSeconds = Number(timestamp);
  const toleranceSeconds = Math.min(Math.max(args.toleranceSeconds ?? 300, 30), 900);
  const nowSeconds = Math.floor((args.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    return { valid: false, reason: 'timestamp_outside_tolerance' };
  }

  const computedHex = await computeRevenueCatWebhookSignature(
    args.rawBody,
    timestamp,
    args.secret,
  );
  const computedSignature = hexToBytes(computedHex)!;
  if (!constantTimeEqual(computedSignature, receivedSignature)) {
    return { valid: false, reason: 'invalid_signature' };
  }

  return { valid: true, timestamp: timestampSeconds };
}
