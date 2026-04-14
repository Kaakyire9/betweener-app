'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

const SUPABASE_VERIFY_URL = 'https://jbyblhithbqwojhwlenv.supabase.co/auth/v1/verify';
const WEB_CALLBACK_URL = 'https://getbetweener.com/auth/callback';
const APP_CALLBACK_BASE = 'betweenerapp://auth/callback';

type Phase = 'loading' | 'opening' | 'ready' | 'desktop' | 'error';

const isMobileUserAgent = (ua: string) => /Android|iPhone|iPad|iPod/i.test(ua);
const isIosUserAgent = (ua: string) => /iPhone|iPad|iPod/i.test(ua);
const isAndroidUserAgent = (ua: string) => /Android/i.test(ua);

const buildCombinedParams = () => {
  if (typeof window === 'undefined') return new URLSearchParams();

  const queryParams = new URLSearchParams(window.location.search || '');
  const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  const combined = new URLSearchParams();

  queryParams.forEach((value, key) => combined.set(key, value));
  hashParams.forEach((value, key) => combined.set(key, value));

  return combined;
};

export default function AuthCallbackPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [title, setTitle] = useState('Opening Betweener');
  const [subtitle, setSubtitle] = useState('Please wait while we securely carry your sign-in back into the app.');
  const [hint, setHint] = useState('');
  const [deepLink, setDeepLink] = useState(APP_CALLBACK_BASE);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userAgent = useMemo(() => (typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''), []);
  const isMobile = isMobileUserAgent(userAgent);
  const isIos = isIosUserAgent(userAgent);
  const isAndroid = isAndroidUserAgent(userAgent);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const combinedParams = buildCombinedParams();
    const queryParams = new URLSearchParams(window.location.search || '');
    const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    const tokenHash = queryParams.get('token_hash');
    const verificationType = queryParams.get('type');
    const hasSessionPayload =
      hashParams.has('access_token') ||
      hashParams.has('refresh_token') ||
      queryParams.has('access_token') ||
      queryParams.has('refresh_token');

    if (tokenHash && verificationType && !hasSessionPayload) {
      const verifyUrl = new URL(SUPABASE_VERIFY_URL);
      verifyUrl.searchParams.set('token_hash', tokenHash);
      verifyUrl.searchParams.set('type', verificationType);
      verifyUrl.searchParams.set('redirect_to', WEB_CALLBACK_URL);
      window.location.replace(verifyUrl.toString());
      return undefined;
    }

    const deepLinkUrl = combinedParams.toString()
      ? `${APP_CALLBACK_BASE}?${combinedParams.toString()}`
      : APP_CALLBACK_BASE;

    setDeepLink(deepLinkUrl);

    if (!isMobile) {
      setPhase('desktop');
      setTitle('Open this on your phone');
      setSubtitle('This secure sign-in handoff is meant to continue inside the Betweener mobile app.');
      setHint('If you opened this on desktop, send the link to your phone or continue from your mobile browser.');
      return undefined;
    }

    setPhase('opening');
    setTitle('Opening Betweener');
    setSubtitle('We found your sign-in and are passing it back into the app now.');
    setHint('');

    window.location.replace(deepLinkUrl);

    const retryTimer = setTimeout(() => {
      try {
        window.location.href = deepLinkUrl;
      } catch {
        // best effort only
      }
    }, 900);

    fallbackTimerRef.current = setTimeout(() => {
      setPhase('ready');
      setTitle('Almost there');
      setSubtitle('If Betweener did not open automatically, use the button below to continue.');

      if (isIos) {
        setHint('Best on Safari. If you opened this in Gmail or another in-app browser, tap Open Betweener or open the link in Safari.');
      } else if (isAndroid) {
        setHint('If nothing happens, make sure Betweener is installed, then tap Open Betweener again.');
      } else {
        setHint('Open Betweener to finish signing in.');
      }
    }, 2200);

    return () => {
      clearTimeout(retryTimer);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, [isAndroid, isIos, isMobile]);

  const showButton = phase === 'ready' || phase === 'desktop' || phase === 'error';

  return (
    <main style={styles.page}>
      <div style={styles.ambientGlowOne} />
      <div style={styles.ambientGlowTwo} />

      <section style={styles.card}>
        <div style={styles.logoStage}>
          <div style={styles.logoRing}>
            <div style={styles.logoCore}>B</div>
          </div>
        </div>

        <div style={styles.eyebrow}>SECURE CALLBACK</div>
        <h1 style={styles.title}>{title}</h1>
        <p style={styles.subtitle}>{subtitle}</p>

        <div style={styles.statusRow}>
          <div
            style={{
              ...styles.spinner,
              opacity: phase === 'ready' || phase === 'desktop' || phase === 'error' ? 0.28 : 1,
              animation: phase === 'ready' || phase === 'desktop' || phase === 'error' ? 'none' : 'spin 0.9s linear infinite',
            }}
          />
        </div>

        {showButton ? (
          <div style={styles.actions}>
            <a href={deepLink} style={styles.primaryButton}>
              Open Betweener
            </a>
            {hint ? <p style={styles.hint}>{hint}</p> : null}
          </div>
        ) : null}

        <p style={styles.finePrint}>
          If you did not request this sign-in, you can safely close this page.
        </p>
      </section>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
    background:
      'radial-gradient(circle at top, rgba(245,235,221,0.08), transparent 35%), linear-gradient(180deg, #071311 0%, #0B1715 48%, #071311 100%)',
    color: '#F4EFE6',
    fontFamily:
      'Manrope, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  ambientGlowOne: {
    position: 'absolute',
    top: '-10%',
    left: '-8%',
    width: '320px',
    height: '320px',
    borderRadius: '999px',
    background: 'radial-gradient(circle, rgba(17,197,198,0.14), transparent 68%)',
    pointerEvents: 'none',
  },
  ambientGlowTwo: {
    position: 'absolute',
    bottom: '-14%',
    right: '-4%',
    width: '300px',
    height: '300px',
    borderRadius: '999px',
    background: 'radial-gradient(circle, rgba(215,166,255,0.16), transparent 68%)',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: '460px',
    borderRadius: '30px',
    border: '1px solid rgba(230,212,184,0.14)',
    background:
      'linear-gradient(180deg, rgba(16,29,26,0.92), rgba(11,23,21,0.96))',
    boxShadow:
      '0 28px 80px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255,255,255,0.05)',
    padding: '34px 24px 26px',
    textAlign: 'center',
    backdropFilter: 'blur(18px)',
  },
  logoStage: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '18px',
  },
  logoRing: {
    width: '84px',
    height: '84px',
    borderRadius: '999px',
    padding: '1px',
    background:
      'linear-gradient(135deg, rgba(17,197,198,0.46), rgba(230,212,184,0.42), rgba(215,166,255,0.36))',
    boxShadow: '0 0 32px rgba(17,197,198,0.16)',
  },
  logoCore: {
    width: '100%',
    height: '100%',
    borderRadius: '999px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(180deg, rgba(10,23,20,0.98), rgba(7,19,17,0.98))',
    color: '#F5EBDD',
    fontSize: '32px',
    fontWeight: 700,
    fontFamily: '"Playfair Display", Georgia, serif',
  },
  eyebrow: {
    marginBottom: '10px',
    color: '#7ED6D1',
    letterSpacing: '0.24em',
    fontSize: '11px',
    fontWeight: 700,
  },
  title: {
    margin: 0,
    color: '#F5EBDD',
    fontFamily: '"Playfair Display", Georgia, serif',
    fontSize: '34px',
    lineHeight: 1.08,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: '14px 0 0',
    color: '#B7C7C1',
    fontSize: '15px',
    lineHeight: 1.6,
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '22px',
  },
  spinner: {
    width: '30px',
    height: '30px',
    borderRadius: '999px',
    border: '3px solid rgba(244,239,230,0.12)',
    borderTopColor: 'rgba(244,239,230,0.88)',
  },
  actions: {
    marginTop: '22px',
  },
  primaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: '54px',
    borderRadius: '18px',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: 700,
    color: '#F8FEFF',
    background: 'linear-gradient(135deg, #11C5C6 0%, #0E8E92 100%)',
    boxShadow: '0 16px 34px rgba(17,197,198,0.22)',
  },
  hint: {
    margin: '14px auto 0',
    maxWidth: '320px',
    color: '#89A19A',
    fontSize: '12px',
    lineHeight: 1.55,
  },
  finePrint: {
    margin: '18px 0 0',
    color: 'rgba(183,199,193,0.72)',
    fontSize: '12px',
    lineHeight: 1.5,
  },
};
