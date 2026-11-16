import Notice from '@/components/ui/Notice';
import { ProfileHeroSkeleton } from '@/components/ui/Skeleton';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  failed: boolean;
  topInset: number;
  onBack: () => void;
  onRetry: () => void;
};

export default function ProfileLoadingState({ failed, topInset, onBack, onRetry }: Props) {
  const theme = Colors[useColorScheme() ?? 'light'];
  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: Math.max(16, topInset) }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={onBack}>
          <Text style={{ color: theme.tint }}>Back</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Profile</Text>
      </View>
      {failed ? (
        <Notice title="Couldn't load profile" message="Check your connection and try again."
          actionLabel="Retry" onAction={onRetry} icon="cloud-alert" />
      ) : (
        <View accessibilityLabel="Loading profile" accessibilityRole="progressbar">
          <Text style={[styles.loading, { color: theme.textMuted }]}>Loading profile...</Text>
          <ProfileHeroSkeleton />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 20, padding: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  loading: { marginHorizontal: 16, marginTop: 12 },
});
