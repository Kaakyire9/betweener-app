import { Colors } from '@/constants/theme';
import { LIVE_PRODUCT_UNAVAILABLE_COPY } from '@/features/live/config/live-product-release';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LiveUnavailableScreen() {
  const colorScheme = useColorScheme();
  const isDark = (colorScheme ?? 'light') === 'dark';
  const theme = Colors[isDark ? 'dark' : 'light'];
  const styles = useMemo(() => createStyles(theme, isDark), [isDark, theme]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <MaterialCommunityIcons name="broadcast-off" size={30} color={theme.tint} />
        </View>
        <Text style={styles.eyebrow}>{LIVE_PRODUCT_UNAVAILABLE_COPY.eyebrow}</Text>
        <Text style={styles.title}>{LIVE_PRODUCT_UNAVAILABLE_COPY.title}</Text>
        <Text style={styles.body}>{LIVE_PRODUCT_UNAVAILABLE_COPY.body}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Return to Betweener"
          onPress={() => router.replace('/(tabs)/vibes')}
          style={styles.action}
        >
          <Text style={styles.actionText}>Continue to Betweener</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: theme.background,
  },
  card: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 34,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: theme.outline,
    backgroundColor: isDark ? theme.backgroundSubtle : 'rgba(255,255,255,0.86)',
  },
  icon: {
    width: 64,
    height: 64,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: isDark ? 'rgba(19,168,168,0.12)' : 'rgba(0,128,128,0.09)',
  },
  eyebrow: {
    color: theme.tint,
    fontFamily: 'Archivo_700Bold',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  title: {
    color: theme.text,
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 30,
    lineHeight: 36,
    textAlign: 'center',
  },
  body: {
    maxWidth: 330,
    color: theme.textMuted,
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  action: {
    minHeight: 50,
    marginTop: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    backgroundColor: theme.tint,
  },
  actionText: {
    color: theme.background,
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 13,
  },
});
