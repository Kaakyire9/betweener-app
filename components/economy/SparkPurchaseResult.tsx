import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { SparkPurchaseState } from '@/lib/economy/wallet/spark-wallet-types';

type Props = {
  purchase: SparkPurchaseState;
  onDismiss: () => void;
  onRetryBalance: () => void;
};

const errorCopy = (code: SparkPurchaseState['errorCode']) => {
  if (code === 'NETWORK_ERROR') return 'Check your connection and try again.';
  if (code === 'ACCOUNT_MISMATCH') return 'Your account changed. Refresh before purchasing again.';
  if (code === 'NOT_ELIGIBLE') return 'Purchases are not allowed for this App Store account.';
  if (code === 'CONFIGURATION_ERROR') return 'This Spark pack is not available right now.';
  return 'The App Store could not complete this purchase.';
};

export function SparkPurchaseResult({ purchase, onDismiss, onRetryBalance }: Props) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];
  if (!['success', 'cancelled', 'failed'].includes(purchase.status)) return null;

  const isSuccess = purchase.status === 'success';
  const title = isSuccess ? "You're all set" : purchase.status === 'cancelled' ? 'Purchase cancelled' : 'Purchase unavailable';
  const body = isSuccess
    ? purchase.balanceRefreshPending
      ? 'Purchase completed. Refreshing your Sparks balance…'
      : `Purchase completed.${purchase.refreshedBalance === null ? '' : ` Your balance is ${purchase.refreshedBalance.toLocaleString()} Sparks.`}`
    : purchase.status === 'cancelled'
      ? 'No charge was made by Betweener.'
      : errorCopy(purchase.errorCode);

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.card, { backgroundColor: theme.backgroundSubtle, borderColor: theme.outline }]}
    >
      <MaterialCommunityIcons
        name={isSuccess ? 'check-circle-outline' : purchase.status === 'cancelled' ? 'close-circle-outline' : 'alert-circle-outline'}
        size={24}
        color={isSuccess ? theme.tint : purchase.status === 'cancelled' ? theme.textMuted : theme.danger}
      />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>{body}</Text>
        <View style={styles.actions}>
          {isSuccess && purchase.balanceRefreshPending ? (
            <Pressable accessibilityRole="button" onPress={onRetryBalance} hitSlop={8}>
              <Text style={[styles.action, { color: theme.tint }]}>Retry balance</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={onDismiss} hitSlop={8}>
            <Text style={[styles.action, { color: theme.tint }]}>Dismiss</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, flexDirection: 'row', gap: 12 },
  copy: { flex: 1 },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
  body: { fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 20, marginTop: 12 },
  action: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
});
