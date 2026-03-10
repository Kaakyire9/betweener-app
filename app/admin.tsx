import { AdminVerificationDashboard } from '@/components/AdminVerificationDashboard';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { canAccessAdminTools } from '@/lib/internal-tools';
import { useAuth } from '@/lib/auth-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminScreen() {
  const { user } = useAuth();
  const isAllowed = canAccessAdminTools(user?.email ?? null);
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === 'dark';
  const styles = createStyles(theme, isDark);

  if (!isAllowed) {
    return <Redirect href="/(tabs)/profile" />;
  }

  const goBackSafe = () => {
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace('/(tabs)/explore');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[withAlpha(theme.tint, isDark ? 0.22 : 0.14), 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bgGlow}
      />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goBackSafe}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Internal Admin</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.hero}>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>Restricted access</Text>
        </View>
        <Text style={styles.heroTitle}>Operations dashboard for moderation, verification, and premium health</Text>
        <Text style={styles.heroBody}>
          This surface is limited to explicitly allowed internal accounts and backed by secure admin RPCs.
        </Text>
      </View>

      <AdminVerificationDashboard />
    </SafeAreaView>
  );
}

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      paddingHorizontal: 18,
    },
    bgGlow: {
      position: 'absolute',
      top: -80,
      right: -80,
      width: 240,
      height: 240,
      borderRadius: 240,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 6,
      paddingBottom: 12,
    },
    backButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.05),
    },
    headerTitle: {
      fontSize: 18,
      color: theme.text,
      fontFamily: 'Archivo_700Bold',
    },
    placeholder: {
      width: 38,
    },
    hero: {
      borderRadius: 22,
      padding: 18,
      gap: 8,
      marginBottom: 16,
      backgroundColor: withAlpha(theme.backgroundSubtle, isDark ? 0.34 : 0.74),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.08),
    },
    heroBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.08),
      backgroundColor: withAlpha(theme.background, isDark ? 0.34 : 0.92),
    },
    heroBadgeText: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    heroTitle: {
      color: theme.text,
      fontSize: 24,
      lineHeight: 30,
      fontFamily: 'PlayfairDisplay_700Bold',
    },
    heroBody: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: 'Manrope_500Medium',
    },
  });

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(
    normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};
