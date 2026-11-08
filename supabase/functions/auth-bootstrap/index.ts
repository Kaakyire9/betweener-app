// @ts-nocheck -- Supabase Edge runtime supplies Deno and remote imports.
import { createPhoneAdmin, phoneJson, phonePreflight } from '../_shared/phone-verification-runtime.ts';
import { resolveVerificationCaller } from '../_shared/phone-verification-boundary.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return phonePreflight();
  if (req.method !== 'GET' && req.method !== 'POST') return phoneJson({ error: 'Method not allowed' }, 405);
  try {
    const admin = createPhoneAdmin();
    const caller = await resolveVerificationCaller(req, token => admin.auth.getUser(token));
    if (caller.status !== 200) return phoneJson({ error: 'Unauthorized' }, caller.status);

    const { error: ensureError } = await admin.from('profiles')
      .upsert({ user_id: caller.userId }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (ensureError) return phoneJson({ error: 'Unable to load profile' }, 503);
    const { data: profile, error } = await admin.from('profiles')
      .select('id,phone_verified,phone_number,profile_completed,deleted_at')
      .eq('user_id', caller.userId).maybeSingle();
    if (error) return phoneJson({ error: 'Unable to load profile' }, 503);

    // Legacy callers may send a signup session ID. Bootstrap reads this caller's profile only.
    const verified = profile?.phone_verified === true && !!profile.phone_number && !profile.deleted_at;
    return phoneJson({
      user_id: caller.userId, profile_id: profile?.id ?? null,
      verified, phone_number: verified ? profile.phone_number : null,
      profile_completed: profile?.profile_completed === true && !profile.deleted_at, linked: false,
    });
  } catch {
    return phoneJson({ error: 'Unable to load profile' }, 503);
  }
});
