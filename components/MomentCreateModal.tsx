import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import LinearGradientSafe from '@/components/NativeWrappers/LinearGradientSafe';
import { showBetweenerAlert } from '@/components/ui/BetweenerAlertHost';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-context';
import { showOpenSettingsPrompt } from '@/lib/permission-prompts';
import { createMomentFromMedia, createTextMoment } from '@/lib/moments';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const pickerMediaTypeImages: ImagePicker.MediaType = 'images';
const pickerMediaTypeVideos: ImagePicker.MediaType = 'videos';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
};

const MOMENT_PROMPTS = [
  'What changed your mind this week?',
  'What kind of home are you building?',
  'What are you ready for now?',
  'What felt peaceful today?',
] as const;

export default function MomentCreateModal({ visible, onClose, onCreated }: Props) {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const placeholderColor = useMemo(() => withAlpha(theme.textMuted, 0.8), [theme.textMuted]);
  const { user } = useAuth();
  const [mode, setMode] = useState<'menu' | 'text'>('menu');
  const [textBody, setTextBody] = useState('');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const entry = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      entry.setValue(0);
      return;
    }
    Animated.timing(entry, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entry, visible]);

  const close = () => {
    setMode('menu');
    setTextBody('');
    setCaption('');
    setError(null);
    onClose();
  };

  const handlePickPhoto = async () => {
    if (!user?.id) return;
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showOpenSettingsPrompt(
        'Photos access',
        'Turn on photo access in Settings so Betweener can upload a Moment from your library.',
      );
      setError('Permission needed to access photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: pickerMediaTypeImages,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setSaving(true);
    const res = await createMomentFromMedia({
      userId: user.id,
      type: 'photo',
      uri: result.assets[0].uri,
      caption,
    });
    setSaving(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    showBetweenerAlert({
      title: 'Moment posted',
      message: 'Your Moment is live for 24 hours.',
      tone: 'success',
    });
    onCreated();
    close();
  };

  const handleRecordVideo = async () => {
    if (!user?.id) return;
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showOpenSettingsPrompt(
        'Camera access',
        'Turn on camera access in Settings so Betweener can record a Moment.',
      );
      setError('Camera permission is required to record a Moment.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: pickerMediaTypeVideos,
      videoMaxDuration: 15,
      allowsEditing: true,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setSaving(true);
    const res = await createMomentFromMedia({
      userId: user.id,
      type: 'video',
      uri: result.assets[0].uri,
      caption,
    });
    setSaving(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    showBetweenerAlert({
      title: 'Moment posted',
      message: 'Your Moment is live for 24 hours.',
      tone: 'success',
    });
    onCreated();
    close();
  };

  const handlePickVideo = async () => {
    if (!user?.id) return;
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showOpenSettingsPrompt(
        'Videos access',
        'Turn on photo library access in Settings so Betweener can upload a video Moment.',
      );
      setError('Permission needed to access videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: pickerMediaTypeVideos,
      quality: 0.9,
      videoMaxDuration: 15,
      allowsEditing: true,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setSaving(true);
    const res = await createMomentFromMedia({
      userId: user.id,
      type: 'video',
      uri: result.assets[0].uri,
      caption,
    });
    setSaving(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    showBetweenerAlert({
      title: 'Moment posted',
      message: 'Your Moment is live for 24 hours.',
      tone: 'success',
    });
    onCreated();
    close();
  };

  const handleCreateText = async () => {
    if (!user?.id) return;
    const trimmed = textBody.trim();
    if (!trimmed) {
      setError('Add a short text Moment.');
      return;
    }
    setSaving(true);
    const res = await createTextMoment({
      userId: user.id,
      type: 'text',
      textBody: trimmed,
      caption,
    });
    setSaving(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    showBetweenerAlert({
      title: 'Moment posted',
      message: 'Your Moment is live for 24 hours.',
      tone: 'success',
    });
    onCreated();
    close();
  };

  const primaryActionText = saving ? 'Uploading...' : 'Capture moment';
  const heroStyle = {
    opacity: entry,
    transform: [
      {
        translateY: entry.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  } as const;
  const contentStyle = {
    opacity: entry.interpolate({
      inputRange: [0, 0.25, 1],
      outputRange: [0, 0, 1],
    }),
    transform: [
      {
        translateY: entry.interpolate({
          inputRange: [0, 1],
          outputRange: [22, 0],
        }),
      },
    ],
  } as const;

  if (!visible) return null;

  return (
    <View style={styles.modalRoot} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, heroStyle]}>
          <BlurViewSafe intensity={26} tint={isDark ? 'dark' : 'light'} style={styles.blur}>
            <LinearGradientSafe
              colors={
                isDark
                  ? ['rgba(10,163,165,0.32)', 'rgba(16,32,36,0.08)', 'rgba(181,118,79,0.18)']
                  : ['rgba(10,163,165,0.20)', 'rgba(252,244,236,0.08)', 'rgba(181,118,79,0.12)']
              }
              start={[0, 0]}
              end={[1, 1]}
              style={styles.hero}
            >
              <View style={styles.heroGlow} />
              <View style={styles.header}>
                <View style={styles.eyebrowPill}>
                  <MaterialCommunityIcons name="motion-play-outline" size={14} color={theme.tint} />
                  <Text style={styles.eyebrowText}>24h signal</Text>
                </View>
                <Pressable onPress={close} style={styles.closeButton}>
                  <MaterialCommunityIcons name="close" size={18} color={theme.text} />
                </Pressable>
              </View>

              <Text style={styles.title}>Post a Moment</Text>
              <Text style={styles.subtitle}>
                Give people something felt, not just something seen.
              </Text>

              <Pressable style={styles.primaryCaptureTile} onPress={handleRecordVideo} disabled={saving}>
                <LinearGradientSafe
                  colors={isDark ? ['rgba(16,190,192,0.22)', 'rgba(16,104,108,0.08)'] : ['rgba(16,190,192,0.16)', 'rgba(16,104,108,0.05)']}
                  start={[0, 0]}
                  end={[1, 1]}
                  style={styles.primaryCaptureFill}
                >
                  <View style={styles.primaryCaptureIcon}>
                    <MaterialCommunityIcons name="video-wireless-outline" size={22} color={theme.tint} />
                  </View>
                  <View style={styles.primaryCaptureBody}>
                    <Text style={styles.primaryCaptureTitle}>{primaryActionText}</Text>
                    <Text style={styles.primaryCaptureCopy}>Record a quick 15-second glimpse with energy and context.</Text>
                  </View>
                  <View style={styles.primaryCaptureArrow}>
                    <MaterialCommunityIcons name="arrow-top-right" size={18} color={theme.text} />
                  </View>
                </LinearGradientSafe>
              </Pressable>
            </LinearGradientSafe>

            <Animated.View style={[styles.content, contentStyle]}>
              <View style={styles.optionGrid}>
                <Pressable style={styles.optionTile} onPress={handlePickPhoto} disabled={saving}>
                  <View style={styles.optionIconWrap}>
                    <MaterialCommunityIcons name="image-outline" size={18} color={theme.accent} />
                  </View>
                  <Text style={styles.optionTitle}>Photo</Text>
                  <Text style={styles.optionCopy}>Library still</Text>
                </Pressable>

                <Pressable style={styles.optionTile} onPress={handlePickVideo} disabled={saving}>
                  <View style={styles.optionIconWrap}>
                    <MaterialCommunityIcons name="movie-open-play-outline" size={18} color={theme.accent} />
                  </View>
                  <Text style={styles.optionTitle}>Video</Text>
                  <Text style={styles.optionCopy}>Library clip</Text>
                </Pressable>

                <Pressable style={[styles.optionTile, styles.optionTileWide]} onPress={() => setMode('text')} disabled={saving}>
                  <View style={styles.optionIconWrap}>
                    <MaterialCommunityIcons name="format-quote-open" size={18} color={theme.accent} />
                  </View>
                  <View style={styles.optionTileWideBody}>
                    <Text style={styles.optionTitle}>Text Moment</Text>
                    <Text style={styles.optionCopy}>Lead with a thought, question, or small truth.</Text>
                  </View>
                </Pressable>
              </View>

              {mode === 'text' ? (
                <View style={styles.textStudio}>
                  <View style={styles.textStudioHeader}>
                    <Text style={styles.textStudioTitle}>Write with signal</Text>
                    <Pressable onPress={() => setMode('menu')} style={styles.modeBackButton}>
                      <MaterialCommunityIcons name="arrow-left" size={16} color={theme.textMuted} />
                    </Pressable>
                  </View>

                  <Text style={styles.textStudioCopy}>
                    A strong text moment gives the right person a clean way in.
                  </Text>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.promptWrap}
                  >
                    {MOMENT_PROMPTS.map((prompt) => (
                      <Pressable
                        key={prompt}
                        style={styles.promptChip}
                        onPress={() => {
                          setTextBody(prompt);
                          setError(null);
                        }}
                      >
                        <Text style={styles.promptChipText}>{prompt}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <TextInput
                    value={textBody}
                    onChangeText={setTextBody}
                    style={styles.textArea}
                    placeholder="Say something thoughtful..."
                    placeholderTextColor={placeholderColor}
                    multiline
                    maxLength={240}
                    textAlignVertical="top"
                  />

                  <Pressable style={styles.primaryButton} onPress={handleCreateText} disabled={saving}>
                    <LinearGradientSafe
                      colors={isDark ? ['#15cfd0', '#0e9ea6'] : ['#12c7c8', '#0e9ba3']}
                      start={[0, 0]}
                      end={[1, 0]}
                      style={styles.primaryButtonFill}
                    >
                      <Text style={styles.primaryText}>{saving ? 'Posting...' : 'Post Text Moment'}</Text>
                    </LinearGradientSafe>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.captionPanel}>
                <Text style={styles.captionLabel}>Set the mood</Text>
                <TextInput
                  value={caption}
                  onChangeText={setCaption}
                  style={styles.captionInput}
                  placeholder="Optional caption"
                  placeholderTextColor={placeholderColor}
                  maxLength={80}
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={styles.footerRow}>
                <Text style={styles.helperText}>Moments expire in 24 hours.</Text>
                <View style={styles.footerPill}>
                  <MaterialCommunityIcons name="weather-night" size={13} color={theme.textMuted} />
                  <Text style={styles.footerPillText}>Ephemeral</Text>
                </View>
              </View>
            </Animated.View>
          </BlurViewSafe>
        </Animated.View>
      </View>
    </View>
  );
}

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

const createStyles = (theme: typeof Colors.light, isDark: boolean) =>
  StyleSheet.create({
    modalRoot: {
      ...StyleSheet.absoluteFill,
      zIndex: 999,
      elevation: 999,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isDark ? 'rgba(2,8,10,0.72)' : 'rgba(15,23,42,0.42)',
    },
    centerWrap: {
      ...StyleSheet.absoluteFill,
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 30,
    },
    sheet: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      borderRadius: 28,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      backgroundColor: withAlpha(theme.background, isDark ? 0.98 : 0.96),
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.34 : 0.16,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 16 },
      elevation: 18,
    },
    blur: { borderRadius: 28, overflow: 'hidden' },
    hero: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 18,
    },
    heroGlow: {
      position: 'absolute',
      right: -28,
      top: -18,
      width: 180,
      height: 180,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(25,210,212,0.12)' : 'rgba(25,210,212,0.08)',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    eyebrowPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      height: 30,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.background, isDark ? 0.22 : 0.62),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.1 : 0.06),
    },
    eyebrowText: {
      color: theme.text,
      fontSize: 12,
      fontFamily: 'Manrope_800ExtraBold',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.background, isDark ? 0.18 : 0.55),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.1 : 0.06),
    },
    title: {
      color: theme.text,
      fontFamily: 'PlayfairDisplay_700Bold',
      fontSize: 34,
      lineHeight: 40,
      marginBottom: 8,
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: 'Manrope_700Bold',
      maxWidth: 320,
      marginBottom: 18,
    },
    primaryCaptureTile: {
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.28 : 0.18),
    },
    primaryCaptureFill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 14,
      paddingVertical: 16,
    },
    primaryCaptureIcon: {
      width: 50,
      height: 50,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.background, isDark ? 0.16 : 0.5),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.1 : 0.06),
    },
    primaryCaptureBody: {
      flex: 1,
    },
    primaryCaptureTitle: {
      color: theme.text,
      fontFamily: 'Archivo_700Bold',
      fontSize: 17,
      marginBottom: 4,
    },
    primaryCaptureCopy: {
      color: theme.textMuted,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 13,
      lineHeight: 18,
    },
    primaryCaptureArrow: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.background, isDark ? 0.18 : 0.38),
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 18,
    },
    optionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    optionTile: {
      flex: 1,
      minWidth: 0,
      padding: 14,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.text, isDark ? 0.055 : 0.04),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.1 : 0.07),
    },
    optionTileWide: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    optionIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, isDark ? 0.12 : 0.08),
      marginBottom: 10,
    },
    optionTileWideBody: {
      flex: 1,
    },
    optionTitle: {
      color: theme.text,
      fontFamily: 'Archivo_700Bold',
      fontSize: 14,
      marginBottom: 4,
    },
    optionCopy: {
      color: theme.textMuted,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 12,
      lineHeight: 17,
    },
    textStudio: {
      marginTop: 16,
      padding: 16,
      borderRadius: 20,
      backgroundColor: withAlpha(theme.text, isDark ? 0.05 : 0.035),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.1 : 0.07),
    },
    textStudioHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    textStudioTitle: {
      color: theme.text,
      fontFamily: 'Archivo_700Bold',
      fontSize: 15,
    },
    modeBackButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.text, isDark ? 0.06 : 0.05),
    },
    textStudioCopy: {
      color: theme.textMuted,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 12,
      lineHeight: 18,
      marginBottom: 12,
    },
    promptWrap: {
      gap: 8,
      paddingRight: 6,
      marginBottom: 12,
    },
    promptChip: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.secondary, isDark ? 0.14 : 0.1),
      borderWidth: 1,
      borderColor: withAlpha(theme.secondary, isDark ? 0.24 : 0.16),
    },
    promptChipText: {
      color: theme.text,
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
    },
    textArea: {
      minHeight: 124,
      borderRadius: 16,
      backgroundColor: theme.backgroundSubtle,
      padding: 14,
      color: theme.text,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      fontFamily: 'Manrope_500Medium',
      marginBottom: 12,
    },
    primaryButton: {
      borderRadius: 16,
      overflow: 'hidden',
    },
    primaryButtonFill: {
      minHeight: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    primaryText: {
      color: Colors.light.background,
      fontFamily: 'Manrope_800ExtraBold',
      fontSize: 14,
    },
    captionPanel: {
      marginTop: 16,
    },
    captionLabel: {
      color: theme.text,
      fontFamily: 'Archivo_700Bold',
      fontSize: 13,
      marginBottom: 8,
    },
    captionInput: {
      height: 44,
      borderRadius: 14,
      backgroundColor: theme.backgroundSubtle,
      paddingHorizontal: 14,
      color: theme.text,
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.18 : 0.1),
      fontFamily: 'Manrope_500Medium',
    },
    footerRow: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    helperText: {
      color: theme.textMuted,
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      flex: 1,
    },
    footerPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 28,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.text, isDark ? 0.05 : 0.04),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.08 : 0.06),
    },
    footerPillText: {
      color: theme.textMuted,
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    errorText: {
      color: theme.accent,
      fontSize: 12,
      marginTop: 10,
      fontFamily: 'Manrope_600SemiBold',
    },
  });
