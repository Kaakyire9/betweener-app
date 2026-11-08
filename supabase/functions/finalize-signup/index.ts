// @ts-nocheck -- Supabase Edge runtime supplies Deno and remote imports.
import { createPhoneAdmin, phoneJson, phonePreflight } from '../_shared/phone-verification-runtime.ts';
import { resolveVerificationCaller } from '../_shared/phone-verification-boundary.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return phonePreflight();
  if (req.method !== 'POST') return phoneJson({ error: 'Method not allowed' }, 405);
  try {
    const admin = createPhoneAdmin();
    const caller = await resolveVerificationCaller(req, token => admin.auth.getUser(token));
    if (caller.status !== 200) return phoneJson({ error: 'Unauthorized' }, caller.status);

    // verify-phone commits ownership before returning success. Finalization
    // acknowledges that result for legacy callers without reassigning proof.
    const { data: profile, error } = await admin.from('profiles')
      .select('phone_verified,phone_number,deleted_at,identity_status')
      .eq('user_id', caller.userId).maybeSingle();
    if (error) return phoneJson({ error: 'Unable to load verification status' }, 503);
    if (!profile?.phone_verified || !profile.phone_number || profile.deleted_at ||
        ['recovered_into_existing_account', 'discarded_duplicate'].includes(profile.identity_status)) {
      return phoneJson({ error: 'Verify your phone after signing in to continue.' }, 409);
    }

    return phoneJson({ success: true, phone_number: profile.phone_number });
  } catch {
    return phoneJson({ error: 'Unable to load verification status' }, 503);
  }
});
