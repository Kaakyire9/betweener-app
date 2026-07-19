import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import { Colors } from '@/constants/theme';
import type { ResponsiveMetrics } from '@/lib/responsive';
import { TRUST_LINKS } from '@/lib/trust-links';
import type { AppVersionRule } from '@/lib/app-version/types';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ForceUpdateGateProps = {
  visible: boolean;
  theme: typeof Colors.light;
  isDark: boolean;
  responsive: ResponsiveMetrics;
  rule: AppVersionRule | null;
  onUpdateNow: () => void;
  onSupport: () => void;
};

const withAlpha = (hex: string | undefined | null, alpha: string) => `${hex ?? '#000000'}${alpha}`;

export default function ForceUpdateGate({
  visible,
  theme,
  isDark,
  responsive,
  rule,
  onUpdateNow,
  onSupport,
}: ForceUpdateGateProps) {
  if (!visible || !rule) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={[styles.backdrop, { backgroundColor: isDark ? '#071113' : '#F3E7DA' }]}>
        <LinearGradient
          colors={
            isDark
              ? [withAlpha(theme.tint, '12'), withAlpha(theme.accent, '10'), 'transparent']
              : [withAlpha(theme.tint, '10'), withAlpha(theme.accent, '0C'), 'transparent']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.safeArea}>
          <View
            style={[
              styles.content,
              {
                paddingHorizontal: responsive.compactWidth ? 22 : 28,
              },
            ]}
          >
            <View
              style={[
                styles.heroCard,
                {
                  borderColor: isDark ? withAlpha('#F4EBDD', '14') : withAlpha('#FFFFFF', 'A2'),
                  backgroundColor: isDark ? withAlpha('#0B1718', 'D8') : withAlpha('#FBF4EA', 'E2'),
                },
              ]}
            >
              <BlurViewSafe
                intensity={isDark ? 28 : 34}
                tint={isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.logoWrap,
                    {
                      backgroundColor: isDark ? withAlpha(theme.tint, '16') : withAlpha(theme.tint, '12'),
                      borderColor: isDark ? withAlpha(theme.tint, '28') : withAlpha(theme.tint, '18'),
                    },
                  ]}
                >
                  <Image source={require('@/assets/images/foreground-icon.png')} style={styles.logo} contentFit="contain" />
                </View>
                <Text style={[styles.badgeText, { color: theme.tint }]}>BETWEENER</Text>
              </View>

              <Text style={[styles.title, { color: isDark ? '#F8F4EC' : '#132125' }]}>Update required</Text>
              <Text style={[styles.body, { color: isDark ? '#C2D0CD' : '#556562' }]}>
                {rule.updateMessage ||
                  'This version of Betweener is no longer supported. Please update to continue safely.'}
              </Text>

              <Pressable onPress={onUpdateNow} style={({ pressed }) => [styles.primary, { opacity: pressed ? 0.92 : 1 }]}>
                <LinearGradient
                  colors={[theme.tint, isDark ? '#53C7CF' : '#4EC0D2', theme.accent]}
                  start={{ x: 0, y: 0.4 }}
                  end={{ x: 1, y: 0.8 }}
                  style={styles.primaryGradient}
                >
                  <Text style={styles.primaryText}>Update Betweener</Text>
                </LinearGradient>
              </Pressable>

              <Pressable onPress={onSupport} style={styles.supportLink}>
                <Text style={[styles.supportText, { color: isDark ? '#DDE9E5' : '#304244' }]}>
                  Need help? {TRUST_LINKS.supportEmail}
                </Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  heroCard: {
    borderRadius: 30,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  logoWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 28,
    height: 28,
  },
  badgeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 2.4,
  },
  title: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 34,
    lineHeight: 40,
    marginBottom: 10,
  },
  body: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 22,
  },
  primary: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  primaryGradient: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryText: {
    color: '#F9F6F0',
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 16,
  },
  supportLink: {
    alignSelf: 'center',
    marginTop: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  supportText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
});
