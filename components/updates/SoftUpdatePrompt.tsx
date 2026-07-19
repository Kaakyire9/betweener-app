import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import { Colors } from '@/constants/theme';
import type { ResponsiveMetrics } from '@/lib/responsive';
import type { AppVersionRule } from '@/lib/app-version/types';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SoftUpdatePromptProps = {
  visible: boolean;
  theme: typeof Colors.light;
  isDark: boolean;
  responsive: ResponsiveMetrics;
  rule: AppVersionRule | null;
  onLater: () => void;
  onUpdateNow: () => void;
};

const withAlpha = (hex: string | undefined | null, alpha: string) => `${hex ?? '#000000'}${alpha}`;

export default function SoftUpdatePrompt({
  visible,
  theme,
  isDark,
  responsive,
  rule,
  onLater,
  onUpdateNow,
}: SoftUpdatePromptProps) {
  if (!visible || !rule) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onLater}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onLater} />
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
                  borderColor: isDark ? withAlpha('#F4EBDD', '18') : withAlpha('#FFFFFF', 'A8'),
                  backgroundColor: isDark ? withAlpha('#0B1618', 'D8') : withAlpha('#F9F2E9', 'E2'),
                },
              ]}
            >
              <BlurViewSafe
                intensity={isDark ? 26 : 34}
                tint={isDark ? 'dark' : 'light'}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                pointerEvents="none"
                colors={
                  isDark
                    ? [withAlpha(theme.accent, '18'), withAlpha(theme.tint, '0D'), 'transparent']
                    : [withAlpha(theme.tint, '12'), withAlpha(theme.accent, '10'), 'transparent']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.glow}
              />

              <View style={styles.headerRow}>
                <View
                  style={[
                    styles.iconWrap,
                    {
                      backgroundColor: isDark ? withAlpha(theme.tint, '12') : withAlpha(theme.tint, '10'),
                      borderColor: isDark ? withAlpha(theme.tint, '24') : withAlpha(theme.tint, '16'),
                    },
                  ]}
                >
                  <Image source={require('@/assets/images/foreground-icon.png')} style={styles.icon} contentFit="contain" />
                </View>
                <View style={styles.copy}>
                  <Text style={[styles.eyebrow, { color: theme.tint }]}>UPDATE READY</Text>
                  <Text style={[styles.title, { color: isDark ? '#F7F4EE' : '#122024' }]}>
                    {rule.updateTitle || 'A better Betweener is ready'}
                  </Text>
                  <Text style={[styles.message, { color: isDark ? '#C2D3CF' : '#526562' }]}>
                    {rule.updateMessage ||
                      'We’ve refined the experience so Vibes, Chat and your profile feel smoother and more intentional.'}
                  </Text>
                </View>
              </View>

              {rule.whatsNewItems.length > 0 ? (
                <View
                  style={[
                    styles.notes,
                    {
                      backgroundColor: isDark ? withAlpha('#FFFFFF', '05') : withAlpha('#FFFFFF', '72'),
                      borderColor: isDark ? withAlpha('#FFFFFF', '08') : withAlpha('#071E22', '0A'),
                    },
                  ]}
                >
                  <Text style={[styles.notesTitle, { color: isDark ? '#F2ECE2' : '#162328' }]}>What’s new</Text>
                  {rule.whatsNewItems.slice(0, 4).map((item) => (
                    <View key={item} style={styles.noteRow}>
                      <View style={[styles.noteDot, { backgroundColor: theme.accent }]} />
                      <Text style={[styles.noteText, { color: isDark ? '#C7D5D2' : '#556562' }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.actions}>
                <Pressable
                  onPress={onLater}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    {
                      borderColor: isDark ? withAlpha('#F4EBDD', '12') : withAlpha('#071E22', '10'),
                      backgroundColor: isDark ? withAlpha('#FFFFFF', '04') : withAlpha('#FFFFFF', '70'),
                      opacity: pressed ? 0.88 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.secondaryLabel, { color: isDark ? '#E8F0ED' : '#243235' }]}>Later</Text>
                </Pressable>
                <Pressable
                  onPress={onUpdateNow}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[theme.tint, isDark ? '#4CC4CC' : '#48B9D4', theme.accent]}
                    start={{ x: 0, y: 0.4 }}
                    end={{ x: 1, y: 0.8 }}
                    style={styles.primaryGradient}
                  >
                    <Text style={styles.primaryLabel}>Update now</Text>
                  </LinearGradient>
                </Pressable>
              </View>
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
    backgroundColor: 'rgba(6, 12, 16, 0.46)',
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
  glow: {
    ...StyleSheet.absoluteFill,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
    marginBottom: 8,
  },
  message: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    lineHeight: 22,
  },
  notes: {
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  notesTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noteDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    marginTop: 8,
  },
  noteText: {
    flex: 1,
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  secondaryButton: {
    flex: 1,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
  primaryButton: {
    flex: 1.15,
    borderRadius: 18,
    overflow: 'hidden',
  },
  primaryGradient: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: '#F9F6F0',
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 15,
  },
});
