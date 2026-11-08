type Caller = { data: { user: { id: string } | null }; error: unknown };

export function normalizeVerificationInput(body: Record<string, unknown>) {
  const raw = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
  const signupSessionId = typeof body.signupSessionId === 'string' ? body.signupSessionId : '';
  if (!/^[+0-9 ().-]{7,24}$/.test(raw) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(signupSessionId)) return null;

  let digits = raw.replace(/\D/g, '');
  if (/^2330\d{9}$/.test(digits)) digits = '233' + digits.slice(4);
  if (!raw.startsWith('+') && /^0\d{9}$/.test(digits)) digits = '233' + digits.slice(1);
  if (!/^[1-9][0-9]{6,14}$/.test(digits)) return null;
  return { phone: '+' + digits, signupSessionId };
}

export async function resolveVerificationCaller(
  req: Request, readUser: (jwt: string) => Promise<Caller>, claimedUserId?: unknown,
) {
  const token = req.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return { status: 401 as const };
  const { data, error } = await readUser(token);
  if (error || !data.user?.id) return { status: 401 as const };
  if (claimedUserId != null && claimedUserId !== data.user.id) return { status: 403 as const };
  return { status: 200 as const, userId: data.user.id };
}

type RateLimitRpc = (name: string, args: Record<string, unknown>) =>
  PromiseLike<{ data: unknown; error: unknown }>;

export async function phoneVerificationRateAllowed(
  rpc: RateLimitRpc, req: Request, operation: 'send' | 'check',
  userId: string, phone: string, daily: boolean,
) {
  const rules: [string, number, number][] = [
    ['user:' + userId, 600, operation === 'send' ? 5 : 10],
    ['phone:' + phone, 600, operation === 'send' ? 3 : 5],
  ];
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip');
  if (ip) rules.push(['ip:' + ip, 600, operation === 'send' ? 5 : 10]);
  if (daily) rules.push(['day:' + phone, 86400, 5]);

  const results = await Promise.all(rules.map(async ([key, window, limit]) => {
    const { data, error } = await rpc('bump_rate_limit', {
      p_key: 'phone-verification:' + operation + ':' + key,
      p_window_seconds: window,
      p_limit: limit,
    });
    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean } | null;
    return !error && row?.allowed === true;
  }));
  return results.every(Boolean);
}

export function getPhoneVerifyConfig(read: (name: string) => string | undefined) {
  const account = read('TWILIO_ACCOUNT_SID')?.trim() ?? '';
  const token = read('TWILIO_AUTH_TOKEN')?.trim() ?? '';
  const service = read('TWILIO_VERIFY_SERVICE_SID')?.trim() ?? '';
  if (!/^AC[0-9a-f]{32}$/i.test(account) || !token || !/^VA[0-9a-f]{32}$/i.test(service)) return null;
  return {
    base: 'https://verify.twilio.com/v2/Services/' + service,
    authorization: 'Basic ' + btoa(account + ':' + token),
  };
}

export const isVerificationSid = (sid: unknown): sid is string =>
  typeof sid === 'string' && /^VE[0-9a-f]{32}$/i.test(sid);

export const isApprovedPhoneCheck = (
  payload: { sid?: unknown; to?: unknown; status?: unknown; valid?: unknown },
  sid: string, phone: string,
) => payload.sid === sid && payload.to === phone &&
  payload.status === 'approved' && payload.valid === true;
