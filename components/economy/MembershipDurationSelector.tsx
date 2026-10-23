import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { type CommerceTheme, useCommerceTheme } from '@/components/economy/CommerceVisuals';
import type { PremiumPlanInterval } from '@/lib/subscriptions';

const INTERVAL_LABEL: Record<PremiumPlanInterval, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

type Props = {
  packages: Record<PremiumPlanInterval, PurchasesPackage | null>;
  selected: PremiumPlanInterval;
  accent: string;
  billingReady: boolean;
  onSelect: (interval: PremiumPlanInterval) => void;
};

export function MembershipDurationSelector({ packages, selected, accent, billingReady, onSelect }: Props) {
  const theme = useCommerceTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View accessibilityRole="tablist" style={styles.rail}>
      {(Object.keys(INTERVAL_LABEL) as PremiumPlanInterval[]).map((interval) => {
        const pkg = packages[interval];
        const active = interval === selected;
        return (
          <Pressable
            key={interval}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled: !pkg }}
            disabled={!pkg}
            onPress={() => onSelect(interval)}
            style={[
              styles.option,
              active && { borderColor: accent, backgroundColor: `${accent}18` },
              !pkg && styles.disabled,
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{INTERVAL_LABEL[interval]}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.price, active && { color: accent }]}>
              {pkg?.product.priceString ?? (billingReady ? 'Unavailable' : 'Loading')}
            </Text>
            {interval === 'annual' && pkg ? <Text style={[styles.meta, { color: accent }]}>BEST VALUE</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(theme: CommerceTheme) {
  return StyleSheet.create({
  rail: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, minHeight: 76, paddingHorizontal: 8, paddingVertical: 11, borderRadius: 17, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.surfaceStrong, justifyContent: 'space-between' },
  disabled: { opacity: 0.38 },
  label: { color: theme.textMuted, fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
  labelActive: { color: theme.text },
  price: { color: theme.text, fontFamily: 'Archivo_700Bold', fontSize: 13, marginTop: 5 },
  meta: { fontFamily: 'Manrope_700Bold', fontSize: 7, letterSpacing: 0.5, marginTop: 3 },
  });
}
