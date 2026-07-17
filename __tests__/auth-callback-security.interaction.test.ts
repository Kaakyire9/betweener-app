import { describe, expect, it } from '@jest/globals';

import { isTrustedAuthCallbackUrl, urlHasAuthPayload } from '@/lib/auth-callback';

describe('auth callback URL security', () => {
  it('accepts only the production HTTPS callback host and exact path', () => {
    expect(isTrustedAuthCallbackUrl('https://getbetweener.com/auth/callback?code=abc')).toBe(true);
    expect(isTrustedAuthCallbackUrl('https://getbetweener.com/auth/callback/?code=abc')).toBe(true);
    expect(isTrustedAuthCallbackUrl('https://getbetweener.com.evil.example/auth/callback?code=abc')).toBe(false);
    expect(isTrustedAuthCallbackUrl('https://getbetweener.com/auth/callback-lookalike?code=abc')).toBe(false);
    expect(isTrustedAuthCallbackUrl('http://getbetweener.com/auth/callback?code=abc')).toBe(false);
  });

  it('accepts the native callback and rejects unrelated custom-scheme routes', () => {
    expect(isTrustedAuthCallbackUrl('betweenerapp://auth/callback?code=abc')).toBe(true);
    expect(isTrustedAuthCallbackUrl('betweenerapp://auth/profile?code=abc')).toBe(false);
  });

  it('recognises supported Supabase callback credentials', () => {
    expect(urlHasAuthPayload('betweenerapp://auth/callback?code=abc')).toBe(true);
    expect(urlHasAuthPayload('betweenerapp://auth/callback#access_token=a&refresh_token=b')).toBe(true);
    expect(urlHasAuthPayload('betweenerapp://auth/callback?message=hello')).toBe(false);
  });
});
