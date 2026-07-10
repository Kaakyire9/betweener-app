import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import { Colors } from '@/constants/theme';
import type { ResponsiveMetrics } from '@/lib/responsive';
import type { AppVersionRule } from '@/lib/app-version/types';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type WhatsNewSheetProps = {
  visible: boolean;
  theme: typeof Colors.light;
  isDark: boolean;
  responsive: ResponsiveMetrics;
  rule: AppVersionRule | null;
  onContinue: () => void;
};

const withAlpha = (hex: string | undefined | null, alpha: string) => `${hex ?? '#000000'}${alpha}`;

export default function WhatsNewSheet({
  visible,
  theme,
  isDark,
  responsive,
  rule,
  onContinue,
}: WhatsNewSheetProps) {
  if (!visible || !rule) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onContinue}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onContinue} />
        <SafeAreaView edges={['bottom']} style={styles.safeArea} pointerEvents="box-none">
          <View
            style={[
              styles.sheetWrap,
              {
                paddingHorizontal: responsive.compactWidth ? 14 : 18,
              },
            ]}
          >
            <View
              style={[
                styles.card,
                {
                  borderColor: isDark ? withAlpha('#F4EBDD', '16') : withAlpha('#FFFFFF', 'A8'),
                  backgroundColor: isDark ? withAlpha('#0B1718', 'D8') : withAlpha('#FBF4EA', 'E4'),
                },
              ]}
            >
              <BlurViewSafe
                intensity={isDark ? 24 : 32}
                tint={isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFillObject}
              />
              <LinearGradient
                pointerEvents="none"
                colors={
                  isDark
                    ? [withAlpha(theme.accent, '18'), withAlpha(theme.tint, '08'), 'transparent']
                    : [withAlpha(theme.accent, '10'), withAlpha(theme.tint, '0A'), 'transparent']
                }
                start={{ x: 0.08, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />

              <View style={styles.headerRow}>
                <View
                  style={[
                    styles.iconWrap,
                    {
                      backgroundColor: isDark ? withAlpha(theme.accent, '12') : withAlpha(theme.accent, '10'),
                      borderColor: isDark ? withAlpha(theme.accent, '22') : withAlpha(theme.accent, '14'),
                    },
                  ]}
                >
                  <Image source={require('@/assets/images/foreground-icon.png')} style={styles.icon} contentFit="contain" />
                </View>
                <View style={styles.copy}>
                  <Text style={[styles.eyebrow, { color: theme.accent }]}>WHAT’S NEW</Text>
                  <Text style={[styles.title, { color: isDark ? '#F8F4EC' : '#132125' }]}>
                    {rule.whatsNewTitle || 'New in Betweener'}
                  </Text>
                  <Text style={[styles.message, { color: isDark ? '#C6D4D0' : '#556562' }]}>
                    A warmer, smoother way to discover intentional connection.
                  </Text>
                </View>
              </View>

              <View style={styles.list}>
                {rule.whatsNewItems.slice(0, 4).map((item, index) => (
                  <View
                    key={`${index}-${item}`}
                    style={[
                      styles.listItem,
                      {
                        backgroundColor: isDark ? withAlpha('#FFFFFF', '04') : withAlpha('#FFFFFF', '74'),
                        borderColor: isDark ? withAlpha('#FFFFFF', '08') : withAlpha('#071E22', '0A'),
                      },
                    ]}
                  >
                    <View style={[styles.listDot, { backgroundColor: index === 0 ? theme.tint : theme.accent }]} />
                    <Text style={[styles.listText, { color: isDark ? '#D6E1DE' : '#304244' }]}>{item}</Text>
                  </View>
                ))}
              </View>

              <Pressable onPress={onContinue} style={({ pressed }) => [styles.primary, { opacity: pressed ? 0.92 : 1 }]}>
                <LinearGradient
                  colors={[theme.tint, isDark ? '#4EC7CF' : '#51BDD5', theme.accent]}
                  start={{ x: 0, y: 0.4 }}
                  end={{ x: 1, y: 0.8 }}
                  style={styles.primaryGradient}
                >
                  <Text style={styles.primaryText}>Continue</Text>
                </LinearGradient>
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
    backgroundColor: 'rgba(6, 12, 16, 0.44)',
    justifyContent: 'flex-end',
  },
  safeArea: {
    width: '100%',
  },
  sheetWrap: {
    paddingBottom: 12,
  },
  card: {
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 28,
    height: 28,
  },
  copy: {
    flex: 1,
  },
  eyebrow: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 2.2,
    marginBottom: 6,
  },
  title: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 31,
    lineHeight: 36,
    marginBottom: 6,
  },
  message: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    lineHeight: 22,
  },
  list: {
    gap: 10,
    marginBottom: 18,
  },
  listItem: {
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  listDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  listText: {
    flex: 1,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
  },
  primary: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  primaryGradient: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#F9F6F0',
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 15,
  },
});
