import { usePathname } from 'expo-router';
import { useCallback } from 'react';

import SoftUpdatePrompt from '@/components/updates/SoftUpdatePrompt';
import ForceUpdateGate from '@/components/updates/ForceUpdateGate';
import WhatsNewSheet from '@/components/updates/WhatsNewSheet';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsiveMetrics } from '@/lib/responsive';
import { Colors } from '@/constants/theme';
import { openSupportEmail } from '@/lib/trust-links';
import { showBetweenerAlert } from '@/components/ui/BetweenerAlertHost';
import { useAppVersionGate } from '@/lib/app-version/useAppVersionGate';

export default function AppVersionGateHost() {
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  const isDark = (colorScheme ?? 'light') === 'dark';
  const theme = Colors[colorScheme ?? 'light'];
  const responsive = useResponsiveMetrics();
  const { forceRule, softRule, whatsNewRule, dismissSoftPrompt, dismissWhatsNew, openStore } =
    useAppVersionGate({ pathname });

  const openRuleStore = useCallback(
    async (storeUrlRule: typeof forceRule | typeof softRule | typeof whatsNewRule) => {
      if (!storeUrlRule) return;
      const opened = await openStore(storeUrlRule);
      if (!opened) {
        showBetweenerAlert({
          title: 'Unable to open the store',
          message: 'Please open the App Store or Google Play and search for Betweener.',
          tone: 'warning',
        });
      }
    },
    [openStore],
  );

  return (
    <>
      <ForceUpdateGate
        visible={Boolean(forceRule)}
        theme={theme}
        isDark={isDark}
        responsive={responsive}
        rule={forceRule}
        onUpdateNow={() => {
          void openRuleStore(forceRule);
        }}
        onSupport={() => {
          void openSupportEmail('Betweener update support');
        }}
      />
      <SoftUpdatePrompt
        visible={!forceRule && Boolean(softRule)}
        theme={theme}
        isDark={isDark}
        responsive={responsive}
        rule={softRule}
        onLater={() => {
          void dismissSoftPrompt();
        }}
        onUpdateNow={() => {
          void openRuleStore(softRule);
        }}
      />
      <WhatsNewSheet
        visible={!forceRule && !softRule && Boolean(whatsNewRule)}
        theme={theme}
        isDark={isDark}
        responsive={responsive}
        rule={whatsNewRule}
        onContinue={() => {
          void dismissWhatsNew();
        }}
      />
    </>
  );
}
