# Auth Flow Checklist (V2)

Use this checklist before releasing auth-related changes.

## Main paths

- Welcome -> Create account -> Google -> (if needed) Verify phone -> Onboarding -> App
- Welcome -> Create account -> Apple -> (if needed) Verify phone -> Onboarding -> App
- Welcome -> Sign in -> Google/Apple -> Gate -> App or Onboarding
- Magic link sign-in/sign-up -> Callback -> Gate
- Password sign-in/sign-up -> Gate routing

## Must-pass expectations

- No infinite "Checking your account..." spinner.
- No bounce from onboarding back to welcome during normal signup.
- Verified users are not asked for phone verification again.
- Callback route can be opened multiple times safely (idempotent behavior).
- Late callback/deep link does not override a correct gate decision.

## Data checks (Supabase)

- `phone_verifications.status = 'verified'` rows are linked to auth user (`user_id` not null).
- `profiles.phone_verified = true` is eventually set for verified users.
- New users with no profile are routed to onboarding.
- Existing users with profile go to app tabs.

## Regression checks

- Sign out then sign back in with same provider.
- Kill app and reopen during callback/gate transition.
- Retry callback URL after successful login (should not break session).
- Slow network simulation still reaches a valid route via gate fallback.

