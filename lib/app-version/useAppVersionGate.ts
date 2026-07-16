import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { fetch as fetchNetInfo } from '@react-native-community/netinfo';

import type { AppVersionRule, InstalledAppVersion } from '@/lib/app-version/types';
import {
  ENABLE_APP_VERSION_GATE,
  ENABLE_FORCE_UPDATE_GATE,
  ENABLE_SOFT_UPDATE_PROMPT,
  fetchRemoteAppVersionRule,
  getInstalledAppVersion,
  hasSoftPromptCooldownElapsed,
  openAppVersionStoreUrl,
  readCachedAppVersionRule,
  readSoftPromptDismissal,
  readWhatsNewSeenVersion,
  shouldBypassForceUpdateForCurrentBuild,
  shouldShowWhatsNew,
  shouldThrottleAppVersionCheck,
  writeCachedAppVersionRule,
  writeSoftPromptDismissal,
  writeWhatsNewSeenVersion,
  decideAppVersionRule,
} from '@/lib/app-version/app-version-service';
import { isNetworkConnectionAvailable } from '@/lib/network-state';
import { logger } from '@/lib/telemetry/logger';

type UseAppVersionGateOptions = {
  pathname?: string | null;
  enabled?: boolean;
};

const isCalmPathname = (pathname?: string | null) => {
  const path = String(pathname || '').toLowerCase();
  if (!path) return true;
  if (
    path.startsWith('/chat/') ||
    path === '/chat' ||
    path.startsWith('/premium-plans') ||
    path.startsWith('/welcome') ||
    path.startsWith('/login') ||
    path.startsWith('/signup') ||
    path.startsWith('/verify-') ||
    path.startsWith('/magic-link') ||
    path.startsWith('/callback') ||
    path.startsWith('/gate') ||
    path.startsWith('/account-recovery') ||
    path.includes('onboarding')
  ) {
    return false;
  }
  return true;
};

export function useAppVersionGate({ pathname, enabled = true }: UseAppVersionGateOptions = {}) {
  const installedRef = useRef<InstalledAppVersion>(getInstalledAppVersion());
  const [forceRule, setForceRule] = useState<AppVersionRule | null>(null);
  const [softRule, setSoftRule] = useState<AppVersionRule | null>(null);
  const [whatsNewRule, setWhatsNewRule] = useState<AppVersionRule | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const inFlightRef = useRef(false);
  const softPromptShownInSessionRef = useRef(false);
  const whatsNewShownVersionRef = useRef<string | null>(null);
  const pendingSoftRuleRef = useRef<AppVersionRule | null>(null);
  const pendingWhatsNewRuleRef = useRef<AppVersionRule | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const canPresentCalmSurface = useMemo(() => isCalmPathname(pathname), [pathname]);

  const tryPresentDeferredSurfaces = useCallback(() => {
    if (!canPresentCalmSurface || forceRule) return;
    if (!softRule && pendingSoftRuleRef.current && !softPromptShownInSessionRef.current) {
      setSoftRule(pendingSoftRuleRef.current);
      pendingSoftRuleRef.current = null;
      softPromptShownInSessionRef.current = true;
      return;
    }
    if (!softRule && !whatsNewRule && pendingWhatsNewRuleRef.current) {
      setWhatsNewRule(pendingWhatsNewRuleRef.current);
      whatsNewShownVersionRef.current = installedRef.current.versionKey;
      pendingWhatsNewRuleRef.current = null;
    }
  }, [canPresentCalmSurface, forceRule, softRule, whatsNewRule]);

  const evaluateRule = useCallback(
    async (
      rule: AppVersionRule,
      source: 'cache' | 'remote',
      options?: { forceOnly?: boolean },
    ) => {
      const installed = installedRef.current;
      const decision = decideAppVersionRule(installed, rule);

      if (
        ENABLE_FORCE_UPDATE_GATE &&
        decision.status === 'force_update' &&
        !shouldBypassForceUpdateForCurrentBuild(installed)
      ) {
        setForceRule(rule);
        setSoftRule(null);
        setWhatsNewRule(null);
        pendingSoftRuleRef.current = null;
        pendingWhatsNewRuleRef.current = null;
        return;
      }

      if (options?.forceOnly) {
        setForceRule(null);
        return;
      }

      setForceRule(null);

      if (
        ENABLE_SOFT_UPDATE_PROMPT &&
        decision.status === 'show_soft_update' &&
        !softPromptShownInSessionRef.current
      ) {
        const dismissal = await readSoftPromptDismissal();
        if (hasSoftPromptCooldownElapsed(rule, dismissal, installed)) {
          if (canPresentCalmSurface) {
            setSoftRule(rule);
            softPromptShownInSessionRef.current = true;
          } else {
            pendingSoftRuleRef.current = rule;
          }
          return;
        }
      }

      if (source === 'remote' && !softRule) {
        const lastSeenWhatsNewVersion = await readWhatsNewSeenVersion();
        if (shouldShowWhatsNew(rule, installed, lastSeenWhatsNewVersion)) {
          if (canPresentCalmSurface) {
            setWhatsNewRule(rule);
            whatsNewShownVersionRef.current = installed.versionKey;
          } else {
            pendingWhatsNewRuleRef.current = rule;
          }
        }
      }
    },
    [canPresentCalmSurface, softRule],
  );

  const runCheck = useCallback(
    async (reason: 'launch' | 'foreground', options?: { ignoreThrottle?: boolean }) => {
      if (!ENABLE_APP_VERSION_GATE || !enabled || inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        installedRef.current = getInstalledAppVersion();
        const cachedState = await readCachedAppVersionRule();
        const networkState = await fetchNetInfo().catch(() => null);
        const isOnline = isNetworkConnectionAvailable(networkState);

        if (cachedState && reason === 'launch') {
          await evaluateRule(cachedState.rule, 'cache', { forceOnly: true });
        }

        const now = Date.now();
        const shouldFetch =
          isOnline &&
          reason === 'foreground'
            ? true
            : isOnline &&
              (
          options?.ignoreThrottle === true ||
          !cachedState ||
          !shouldThrottleAppVersionCheck(cachedState.checkedAt, now) ||
          (cachedState && decideAppVersionRule(installedRef.current, cachedState.rule).status === 'force_update')
              );

        if (!shouldFetch) return;

        const remoteRule = await fetchRemoteAppVersionRule(installedRef.current);
        if (!remoteRule) return;

        await writeCachedAppVersionRule({
          checkedAt: now,
          rule: remoteRule,
        });

        await evaluateRule(remoteRule, 'remote');
      } catch (error) {
        logger.warn('[app-version] version_check_failed', {
          reason,
          message: error instanceof Error ? error.message : String(error),
        });

        const cachedState = await readCachedAppVersionRule();
        if (cachedState) {
          await evaluateRule(cachedState.rule, 'cache', { forceOnly: true });
        }
      } finally {
        setHasHydrated(true);
        inFlightRef.current = false;
      }
    },
    [enabled, evaluateRule],
  );

  const dismissSoftPrompt = useCallback(async () => {
    const installed = installedRef.current;
    await writeSoftPromptDismissal({
      versionKey: installed.versionKey,
      dismissedAt: Date.now(),
    });
    setSoftRule(null);
    pendingSoftRuleRef.current = null;
  }, []);

  const dismissWhatsNew = useCallback(async () => {
    const installed = installedRef.current;
    await writeWhatsNewSeenVersion(installed.versionKey);
    whatsNewShownVersionRef.current = installed.versionKey;
    setWhatsNewRule(null);
    pendingWhatsNewRuleRef.current = null;
  }, []);

  const openStore = useCallback(async (rule: AppVersionRule) => openAppVersionStoreUrl(rule), []);

  useEffect(() => {
    if (!ENABLE_APP_VERSION_GATE || !enabled) {
      setHasHydrated(true);
      return;
    }

    void runCheck('launch', { ignoreThrottle: false });
  }, [enabled, runCheck]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previous = appStateRef.current;
      appStateRef.current = nextState;
      if (previous !== 'active' && nextState === 'active') {
        setTimeout(() => {
          void runCheck('foreground');
        }, 650);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [runCheck]);

  useEffect(() => {
    tryPresentDeferredSurfaces();
  }, [pathname, tryPresentDeferredSurfaces]);

  return {
    forceRule,
    softRule,
    whatsNewRule,
    hasHydrated,
    dismissSoftPrompt,
    dismissWhatsNew,
    openStore,
    rerunCheck: runCheck,
  };
}
