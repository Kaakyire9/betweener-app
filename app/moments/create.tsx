import BlurViewSafe from '@/components/NativeWrappers/BlurViewSafe';
import LinearGradientSafe from '@/components/NativeWrappers/LinearGradientSafe';
import TextMomentCard from '@/components/moments/TextMomentCard';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { haptics } from '@/lib/haptics';
import {
  DEFAULT_MOMENT_TEXT_STYLE,
  getMomentTextBodyStyle,
  MOMENT_TEXT_FONT_OPTIONS,
  MOMENT_TEXT_THEMES,
  type MomentMetadata,
  type MomentTextStyle,
} from '@/lib/moment-text-style';
import {
  createMomentFromMediaOfflineSafe,
  createTextMomentOfflineSafe,
} from '@/lib/moments-offline-actions';
import {
  fetchMomentPostingEligibility,
  getMomentPostingErrorMessage,
  type MomentPostingEligibility,
} from '@/lib/moments-eligibility';
import { appendMomentsFeedSnapshot, appendOwnMomentSnapshot } from '@/lib/offline/moments-store';
import { showOpenSettingsPrompt } from '@/lib/permission-prompts';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const pickerMediaTypeImages: ImagePicker.MediaType = 'images';
const pickerMediaTypeVideos: ImagePicker.MediaType = 'videos';

const MOMENT_PROMPTS = [
  'What changed your mind this week?',
  'What kind of home are you building?',
  'What are you ready for now?',
  'What felt peaceful today?',
] as const;

type MediaDraft = {
  type: 'photo' | 'video';
  uri: string;
  sourceLabel: string;
};

type PostedMomentPreview = {
  type: 'photo' | 'video' | 'text';
  syncStatus: 'synced' | 'queued';
  caption: string;
  metadata?: MomentMetadata | null;
  uri?: string;
  textBody?: string;
  sourceLabel?: string;
};

const TEXT_STYLE_TOGGLES: Array<{
  key: 'bold' | 'italic' | 'underline' | 'strike';
  label: string;
}> = [
  { key: 'bold', label: 'B' },
  { key: 'italic', label: 'I' },
  { key: 'underline', label: 'U' },
  { key: 'strike', label: 'S' },
];

const getFileExtension = (uri: string) => {
  const parts = uri.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'bin';
};

const getDraftContentType = (type: 'photo' | 'video', ext: string) => {
  if (type === 'photo') {
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return 'image/jpeg';
  }
  if (ext === 'mov') return 'video/quicktime';
  return 'video/mp4';
};

export default function MomentCreateScreen() {
  const colorScheme = useColorScheme();
  const resolvedScheme = (colorScheme ?? 'light') === 'dark' ? 'dark' : 'light';
  const theme = Colors[resolvedScheme];
  const isDark = resolvedScheme === 'dark';
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const placeholderColor = useMemo(() => withAlpha(theme.textMuted, 0.8), [theme.textMuted]);
  const { user, profile } = useAuth();
  const params = useLocalSearchParams();
  const sourceParam = typeof params.source === 'string' ? params.source : null;
  const sourceCircleId = typeof params.circleId === 'string' ? params.circleId : null;
  const sourceCircleName = typeof params.circleName === 'string' ? params.circleName : null;
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const textStudioYRef = useRef(0);
  const textAreaYRef = useRef(0);
  const captionPanelYRef = useRef(0);
  const [mode, setMode] = useState<'menu' | 'text'>('menu');
  const [textBody, setTextBody] = useState('');
  const [textStyle, setTextStyle] = useState<MomentTextStyle>(DEFAULT_MOMENT_TEXT_STYLE);
  const [caption, setCaption] = useState('');
  const [draftMedia, setDraftMedia] = useState<MediaDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [postingEligibility, setPostingEligibility] = useState<MomentPostingEligibility | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [activeFocusTarget, setActiveFocusTarget] = useState<'text' | 'caption' | null>(null);
  const [postedMoment, setPostedMoment] = useState<PostedMomentPreview | null>(null);
  const successHeroOpacity = useRef(new Animated.Value(0)).current;
  const successHeroTranslate = useRef(new Animated.Value(14)).current;
  const successCardOpacity = useRef(new Animated.Value(0)).current;
  const successCardTranslate = useRef(new Animated.Value(18)).current;
  const successActionsOpacity = useRef(new Animated.Value(0)).current;
  const successActionsTranslate = useRef(new Animated.Value(18)).current;
  const textMetadata = useMemo<MomentMetadata>(() => ({ text_style: textStyle }), [textStyle]);
  const textEditorStyle = useMemo(
    () => ({
      ...getMomentTextBodyStyle(textStyle),
      fontSize: 15,
      lineHeight: 23,
    }),
    [textStyle],
  );
  const canPostMoment = postingEligibility?.canPost !== false;

  useEffect(() => {
    let cancelled = false;
    if (!user?.id || !profile?.id) {
      setPostingEligibility(null);
      return;
    }

    (async () => {
      const next = await fetchMomentPostingEligibility({ profileId: profile.id });
      if (!cancelled) {
        setPostingEligibility(next);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile?.id, user?.id]);

  const close = () => {
    haptics.tap();
    if (sourceParam === 'circles' && sourceCircleId) {
      router.replace({ pathname: '/circles/[id]', params: { id: sourceCircleId } });
      return;
    }
    router.back();
  };

  const finishCreated = (preview: PostedMomentPreview) => {
    haptics.success();
    setSaving(false);
    setActiveFocusTarget(null);
    setKeyboardHeight(0);
    setPostedMoment(preview);
  };

  const stageMediaDraft = (draft: MediaDraft) => {
    setDraftMedia(draft);
    setMode('menu');
    setTextBody('');
    setError(null);
    haptics.medium();
  };

  const handleOpenTextStudio = () => {
    if (!canPostMoment) {
      haptics.warning();
      setError(postingEligibility?.promptBody ?? null);
      return;
    }
    setDraftMedia(null);
    setMode('text');
    setError(null);
    haptics.light();
  };

  const clearDraftMedia = () => {
    setDraftMedia(null);
    setError(null);
    haptics.tap();
  };

  const toggleTextStyleFlag = (key: 'bold' | 'italic' | 'underline' | 'strike') => {
    setTextStyle((prev) => ({ ...prev, [key]: !prev[key] }));
    haptics.tap();
  };

  const handleSelectTextFont = (font: MomentTextStyle['font']) => {
    setTextStyle((prev) => ({ ...prev, font }));
    haptics.light();
  };

  const handleSelectTextTheme = (themeId: MomentTextStyle['themeId']) => {
    setTextStyle((prev) => ({ ...prev, themeId }));
    haptics.light();
  };

  const scrollInputIntoView = useCallback((targetY: number, topPadding = 24) => {
    const delay = Platform.OS === 'android' ? 120 : 40;
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, targetY - topPadding),
        animated: true,
      });
    }, delay);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      const nextHeight = event.endCoordinates?.height ?? 0;
      setKeyboardHeight(nextHeight);

      if (activeFocusTarget === 'text') {
        scrollInputIntoView(textAreaYRef.current || textStudioYRef.current, Platform.OS === 'ios' ? 18 : 24);
      } else if (activeFocusTarget === 'caption') {
        scrollInputIntoView(captionPanelYRef.current, Platform.OS === 'ios' ? 20 : 28);
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setActiveFocusTarget(null);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [activeFocusTarget, scrollInputIntoView]);

  useEffect(() => {
    if (!postedMoment) return;
    successHeroOpacity.setValue(0);
    successHeroTranslate.setValue(14);
    successCardOpacity.setValue(0);
    successCardTranslate.setValue(18);
    successActionsOpacity.setValue(0);
    successActionsTranslate.setValue(18);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(successHeroOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(successHeroTranslate, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.stagger(70, [
        Animated.parallel([
          Animated.timing(successCardOpacity, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(successCardTranslate, {
            toValue: 0,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(successActionsOpacity, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(successActionsTranslate, {
            toValue: 0,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [
    postedMoment,
    successActionsOpacity,
    successActionsTranslate,
    successCardOpacity,
    successCardTranslate,
    successHeroOpacity,
    successHeroTranslate,
  ]);

  const handlePickPhoto = async () => {
    if (!user?.id) return;
    if (!canPostMoment) {
      haptics.warning();
      setError(postingEligibility?.promptBody ?? null);
      return;
    }
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      haptics.warning();
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
    stageMediaDraft({ type: 'photo', uri: result.assets[0].uri, sourceLabel: 'Library still' });
  };

  const handleRecordVideo = async () => {
    if (!user?.id) return;
    if (!canPostMoment) {
      haptics.warning();
      setError(postingEligibility?.promptBody ?? null);
      return;
    }
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      haptics.warning();
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
    stageMediaDraft({ type: 'video', uri: result.assets[0].uri, sourceLabel: 'Recorded clip' });
  };

  const handlePickVideo = async () => {
    if (!user?.id) return;
    if (!canPostMoment) {
      haptics.warning();
      setError(postingEligibility?.promptBody ?? null);
      return;
    }
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      haptics.warning();
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
    stageMediaDraft({ type: 'video', uri: result.assets[0].uri, sourceLabel: 'Library clip' });
  };

  const handlePublishDraftMedia = async () => {
    if (!user?.id || !draftMedia) return;
    if (!canPostMoment) {
      haptics.warning();
      setError(postingEligibility?.promptBody ?? null);
      return;
    }
    setSaving(true);
    try {
      const ext = getFileExtension(draftMedia.uri);
      const fileName = `moment-${Date.now()}.${ext}`;
      const res = await createMomentFromMediaOfflineSafe({
        userId: user.id,
        type: draftMedia.type,
        uri: draftMedia.uri,
        fileName,
        contentType: getDraftContentType(draftMedia.type, ext),
        caption,
      });
      await appendOwnMomentSnapshot(user.id, {
        id: res.momentId,
        userId: user.id,
        type: draftMedia.type,
        mediaUrl: res.mediaPath ?? null,
        caption: caption.trim(),
        visibility: 'matches',
      });
      await appendMomentsFeedSnapshot(user.id, {
        id: res.momentId,
        userId: user.id,
        type: draftMedia.type,
        mediaUrl: res.mediaPath ?? null,
        caption: caption.trim(),
        visibility: 'matches',
      });
      const createdPreview: PostedMomentPreview = {
        type: draftMedia.type,
        syncStatus: res.status,
        uri: draftMedia.uri,
        caption: caption.trim(),
        sourceLabel: draftMedia.sourceLabel,
      };
      setDraftMedia(null);
      finishCreated(createdPreview);
    } catch (error) {
      setSaving(false);
      haptics.error();
      setError(getMomentPostingErrorMessage(error));
      return;
    }
  };

  const handleCreateText = async () => {
    if (!user?.id) return;
    if (!canPostMoment) {
      haptics.warning();
      setError(postingEligibility?.promptBody ?? null);
      return;
    }
    const trimmed = textBody.trim();
    if (!trimmed) {
      haptics.warning();
      setError('Add a short text Moment.');
      return;
    }
    setSaving(true);
    try {
      const res = await createTextMomentOfflineSafe({
        userId: user.id,
        textBody: trimmed,
        caption,
        metadata: textMetadata,
      });
      await appendOwnMomentSnapshot(user.id, {
        id: res.momentId,
        userId: user.id,
        type: 'text',
        textBody: trimmed,
        caption: caption.trim(),
        metadata: textMetadata,
        visibility: 'matches',
      });
      await appendMomentsFeedSnapshot(user.id, {
        id: res.momentId,
        userId: user.id,
        type: 'text',
        textBody: trimmed,
        caption: caption.trim(),
        metadata: textMetadata,
        visibility: 'matches',
      });
      finishCreated({
        type: 'text',
        syncStatus: res.status,
        textBody: trimmed,
        caption: caption.trim(),
        metadata: textMetadata,
      });
    } catch (error) {
      setSaving(false);
      haptics.error();
      setError(getMomentPostingErrorMessage(error));
      return;
    }
  };

  const handleDoneAfterPost = () => {
    haptics.tap();
    if (sourceParam === 'circles' && sourceCircleId) {
      router.replace({ pathname: '/circles/[id]', params: { id: sourceCircleId } });
      return;
    }
    router.back();
  };

  const handleViewMyMoment = () => {
    haptics.light();
    router.replace('/my-moments');
  };

  const primaryActionText = saving
    ? 'Uploading...'
    : draftMedia?.type === 'video'
      ? 'Recapture moment'
      : 'Capture moment';
  const mediaPublishText = saving
    ? 'Posting...'
    : draftMedia?.type === 'photo'
      ? 'Post Photo Moment'
      : 'Post Video Moment';
  const textPreview = textBody.trim();
  const momentQueued = postedMoment?.syncStatus === 'queued';

  if (postedMoment) {
    return (
      <SafeAreaView style={styles.screen}>
        <LinearGradientSafe
          colors={
            isDark
              ? ['#041819', '#071013', '#0f1117']
              : ['#f4faf9', '#eef6f4', '#f6efe7']
          }
          start={[0, 0]}
          end={[1, 1]}
          style={styles.screenGlow}
        />
        <View style={styles.successShell}>
          <View style={styles.successSheet}>
            <BlurViewSafe intensity={26} tint={isDark ? 'dark' : 'light'} style={styles.blur}>
              <Animated.View
                style={{
                  opacity: successHeroOpacity,
                  transform: [{ translateY: successHeroTranslate }],
                }}
              >
                <LinearGradientSafe
                  colors={
                    isDark
                      ? ['rgba(10,163,165,0.28)', 'rgba(16,32,36,0.08)', 'rgba(181,118,79,0.12)']
                      : ['rgba(10,163,165,0.16)', 'rgba(252,244,236,0.08)', 'rgba(181,118,79,0.08)']
                  }
                  start={[0, 0]}
                  end={[1, 1]}
                  style={styles.successHero}
                >
                  <View style={styles.successHeroGlow} />
                  <View style={styles.successBadge}>
                    <MaterialCommunityIcons name="check-decagram" size={18} color={theme.tint} />
                    <Text style={styles.successBadgeText}>{momentQueued ? 'Queued offline' : 'Live now'}</Text>
                  </View>
                  <Text style={styles.successTitle}>{momentQueued ? 'Moment queued' : 'Moment posted'}</Text>
                  <Text style={styles.successSubtitle}>
                    {momentQueued
                      ? 'It will go live as soon as you are back online.'
                      : 'Your signal is out for the next 24 hours.'}
                  </Text>
                  <Text style={styles.successSupportCopy}>
                    {momentQueued
                      ? 'Your draft is stored locally and will sync through the offline queue.'
                      : 'People will catch it in the rail, not lose it in the feed.'}
                  </Text>
                </LinearGradientSafe>
              </Animated.View>

              <View style={styles.successContent}>
                <Animated.View
                  style={{
                    opacity: successCardOpacity,
                    transform: [{ translateY: successCardTranslate }],
                  }}
                >
                <View style={styles.successPreviewCard}>
                  {postedMoment.type === 'photo' && postedMoment.uri ? (
                    <Image source={{ uri: postedMoment.uri }} style={styles.successPhoto} resizeMode="cover" />
                  ) : null}

                  {postedMoment.type === 'video' ? (
                    <View style={styles.successMediaFallback}>
                      <View style={styles.successMediaIcon}>
                        <MaterialCommunityIcons name="play-circle-outline" size={28} color={theme.tint} />
                      </View>
                      <View style={styles.successMediaBody}>
                        <Text style={styles.successMediaTitle}>Video Moment</Text>
                        <Text style={styles.successMediaCopy}>
                          {postedMoment.sourceLabel ?? 'Clip selected'}. Ready in your story rail.
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {postedMoment.type === 'text' && postedMoment.textBody ? (
                    <TextMomentCard
                      body={postedMoment.textBody}
                      caption={postedMoment.caption}
                      metadata={postedMoment.metadata}
                      eyebrow="Text Moment"
                      variant="success"
                    />
                  ) : null}

                  {postedMoment.caption && postedMoment.type !== 'text' ? (
                    <View style={styles.successCaptionWrap}>
                      <Text style={styles.successCaptionLabel}>Caption</Text>
                      <Text style={styles.successCaptionText}>{postedMoment.caption}</Text>
                    </View>
                  ) : null}
                </View>
                </Animated.View>

                <Animated.View
                  style={{
                    opacity: successActionsOpacity,
                    transform: [{ translateY: successActionsTranslate }],
                  }}
                >
                <View style={styles.successActions}>
                  <Pressable style={styles.successSecondaryButton} onPress={handleDoneAfterPost}>
                    <Text style={styles.successSecondaryButtonText}>Done</Text>
                  </Pressable>
                  <Pressable style={styles.successPrimaryButton} onPress={handleViewMyMoment}>
                    <LinearGradientSafe
                      colors={isDark ? ['#15cfd0', '#0e9ea6'] : ['#12c7c8', '#0e9ba3']}
                      start={[0, 0]}
                      end={[1, 0]}
                      style={styles.successPrimaryButtonFill}
                    >
                      <View style={styles.successPrimaryButtonBody}>
                        <Text style={styles.primaryText}>View in My Moments</Text>
                        <MaterialCommunityIcons
                          name="arrow-right"
                          size={16}
                          color={Colors.light.background}
                        />
                      </View>
                    </LinearGradientSafe>
                  </Pressable>
                </View>
                </Animated.View>
              </View>
            </BlurViewSafe>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <LinearGradientSafe
        colors={
          isDark
            ? ['#041819', '#071013', '#0f1117']
            : ['#f4faf9', '#eef6f4', '#f6efe7']
        }
        start={[0, 0]}
        end={[1, 1]}
        style={styles.screenGlow}
      />
      <View style={styles.keyboardWrap}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom:
                Math.max(insets.bottom, 16) +
                28 +
                (Platform.OS === 'android' ? keyboardHeight : 0),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View style={styles.sheet}>
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
                  <Pressable onPress={close} style={styles.closeButton} accessibilityLabel="Close">
                    <MaterialCommunityIcons name="close" size={18} color={theme.text} />
                  </Pressable>
                </View>

                <Text style={styles.title}>Post a Moment</Text>
                <Text style={styles.subtitle}>
                  Give people something felt, not just something seen.
                </Text>

                {sourceParam === 'circles' && sourceCircleId ? (
                  <View style={styles.sourceContextCard}>
                    <View style={styles.sourceContextIcon}>
                      <MaterialCommunityIcons name="account-group-outline" size={16} color={theme.tint} />
                    </View>
                    <View style={styles.sourceContextCopy}>
                      <Text style={styles.sourceContextTitle}>From {sourceCircleName || 'your Circle'}</Text>
                      <Text style={styles.sourceContextBody}>
                        Share something that gives people in this Circle a warmer sense of your energy.
                      </Text>
                    </View>
                  </View>
                ) : null}

                {postingEligibility?.canPost === false ? (
                  <View style={styles.momentGateCard}>
                    <View style={styles.momentGateHeader}>
                      <MaterialCommunityIcons name="heart-plus-outline" size={18} color={theme.accent} />
                      <Text style={styles.momentGateTitle}>{postingEligibility.promptTitle}</Text>
                    </View>
                    <Text style={styles.momentGateBody}>{postingEligibility.promptBody}</Text>
                    <View style={styles.momentGateActions}>
                      <Pressable style={styles.momentGateSecondaryButton} onPress={() => router.push('/(tabs)/vibes')}>
                        <Text style={styles.momentGateSecondaryButtonText}>Open Vibes</Text>
                      </Pressable>
                      <Pressable style={styles.momentGatePrimaryButton} onPress={() => router.push('/(tabs)/intent')}>
                        <Text style={styles.momentGatePrimaryButtonText}>Open Intent</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                <Pressable
                  style={[styles.primaryCaptureTile, !canPostMoment ? styles.disabledSurface : null]}
                  onPress={() => {
                    haptics.medium();
                    void handleRecordVideo();
                  }}
                  disabled={saving}
                >
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

              <View style={styles.content}>
                {postingEligibility?.nudgeTitle ? (
                  <View style={styles.momentNudgeCard}>
                    <View style={styles.momentNudgeIcon}>
                      <MaterialCommunityIcons name="message-text-fast-outline" size={17} color={theme.tint} />
                    </View>
                    <View style={styles.momentNudgeBody}>
                      <Text style={styles.momentNudgeTitle}>{postingEligibility.nudgeTitle}</Text>
                      <Text style={styles.momentNudgeCopy}>{postingEligibility.nudgeBody}</Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.optionGrid}>
                  <Pressable
                    style={[styles.optionTile, !canPostMoment ? styles.disabledSurface : null]}
                    onPress={() => {
                      haptics.light();
                      void handlePickPhoto();
                    }}
                    disabled={saving}
                  >
                    <View style={styles.optionIconWrap}>
                      <MaterialCommunityIcons name="image-outline" size={18} color={theme.accent} />
                    </View>
                    <Text style={styles.optionTitle}>Photo</Text>
                    <Text style={styles.optionCopy}>Library still</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.optionTile, !canPostMoment ? styles.disabledSurface : null]}
                    onPress={() => {
                      haptics.light();
                      void handlePickVideo();
                    }}
                    disabled={saving}
                  >
                    <View style={styles.optionIconWrap}>
                      <MaterialCommunityIcons name="movie-open-play-outline" size={18} color={theme.accent} />
                    </View>
                    <Text style={styles.optionTitle}>Video</Text>
                    <Text style={styles.optionCopy}>Library clip</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={[styles.optionTile, styles.optionTileWide, styles.textMomentRow, !canPostMoment ? styles.disabledSurface : null]}
                  onPress={handleOpenTextStudio}
                  disabled={saving}
                >
                    <View style={[styles.optionIconWrap, styles.textMomentIconWrap]}>
                      <MaterialCommunityIcons name="format-quote-open" size={18} color={theme.accent} />
                    </View>
                    <View style={styles.optionTileWideBody}>
                      <Text style={styles.optionTitle}>Text Moment</Text>
                      <Text style={styles.optionCopy}>Lead with a thought, question, or small truth.</Text>
                    </View>
                    <View style={styles.textMomentArrow}>
                      <MaterialCommunityIcons name="arrow-right" size={18} color={theme.textMuted} />
                    </View>
                </Pressable>

                {draftMedia ? (
                  <View style={styles.previewPanel}>
                    <View style={styles.previewHeader}>
                      <Text style={styles.previewEyebrow}>Preview</Text>
                      <View style={styles.previewTypePill}>
                        <MaterialCommunityIcons
                          name={draftMedia.type === 'photo' ? 'image-outline' : 'movie-open-play-outline'}
                          size={13}
                          color={theme.textMuted}
                        />
                        <Text style={styles.previewTypePillText}>
                          {draftMedia.type === 'photo' ? 'Photo moment' : 'Video moment'}
                        </Text>
                      </View>
                    </View>

                    {draftMedia.type === 'photo' ? (
                      <Image source={{ uri: draftMedia.uri }} style={styles.photoPreview} resizeMode="cover" />
                    ) : (
                      <View style={styles.videoPreviewCard}>
                        <View style={styles.videoPreviewIcon}>
                          <MaterialCommunityIcons name="play-circle-outline" size={28} color={theme.tint} />
                        </View>
                        <View style={styles.videoPreviewBody}>
                          <Text style={styles.videoPreviewTitle}>Video selected</Text>
                          <Text style={styles.videoPreviewCopy}>
                            {draftMedia.sourceLabel}. Keep it short, clear, and worth replaying.
                          </Text>
                        </View>
                      </View>
                    )}

                    <View style={styles.previewActions}>
                      <Pressable style={styles.previewSecondaryButton} onPress={clearDraftMedia} disabled={saving}>
                        <Text style={styles.previewSecondaryButtonText}>Remove</Text>
                      </Pressable>
                      <Pressable
                        style={styles.primaryButton}
                        onPress={() => {
                          haptics.medium();
                          void handlePublishDraftMedia();
                        }}
                        disabled={saving}
                      >
                        <LinearGradientSafe
                          colors={isDark ? ['#15cfd0', '#0e9ea6'] : ['#12c7c8', '#0e9ba3']}
                          start={[0, 0]}
                          end={[1, 0]}
                          style={styles.primaryButtonFill}
                        >
                          <Text style={styles.primaryText}>{mediaPublishText}</Text>
                        </LinearGradientSafe>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {mode === 'text' ? (
                  <View
                    style={styles.textStudio}
                    onLayout={(event) => {
                      textStudioYRef.current = event.nativeEvent.layout.y;
                    }}
                  >
                    <View style={styles.textStudioHeader}>
                      <Text style={styles.textStudioTitle}>Write with signal</Text>
                      <Pressable
                        onPress={() => {
                          setMode('menu');
                          haptics.tap();
                        }}
                        style={styles.modeBackButton}
                      >
                        <MaterialCommunityIcons name="arrow-left" size={16} color={theme.textMuted} />
                      </Pressable>
                    </View>

                    <Text style={styles.textStudioCopy}>
                      A strong text moment gives the right person a clean way in.
                    </Text>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptWrap}>
                      {MOMENT_PROMPTS.map((prompt) => (
                        <Pressable
                          key={prompt}
                          style={styles.promptChip}
                          onPress={() => {
                            setTextBody(prompt);
                            setError(null);
                            haptics.tap();
                          }}
                        >
                          <Text style={styles.promptChipText}>{prompt}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>

                    <View style={styles.textControlSection}>
                      <Text style={styles.textControlLabel}>Format</Text>
                      <View style={styles.textToggleRow}>
                        {TEXT_STYLE_TOGGLES.map((toggle) => {
                          const active = Boolean(textStyle[toggle.key]);
                          return (
                            <Pressable
                              key={toggle.key}
                              style={[styles.textToggleChip, active ? styles.textToggleChipActive : null]}
                              onPress={() => toggleTextStyleFlag(toggle.key)}
                            >
                              <Text
                                style={[
                                  styles.textToggleChipText,
                                  toggle.key === 'italic' ? styles.textToggleItalic : null,
                                  toggle.key === 'underline' ? styles.textToggleUnderline : null,
                                  toggle.key === 'strike' ? styles.textToggleStrike : null,
                                  active ? styles.textToggleChipTextActive : null,
                                ]}
                              >
                                {toggle.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.textControlSection}>
                      <Text style={styles.textControlLabel}>Font</Text>
                      <View style={styles.fontChipRow}>
                        {MOMENT_TEXT_FONT_OPTIONS.map((option) => {
                          const active = textStyle.font === option.id;
                          return (
                            <Pressable
                              key={option.id}
                              style={[styles.fontChip, active ? styles.fontChipActive : null]}
                              onPress={() => handleSelectTextFont(option.id)}
                            >
                              <Text style={[styles.fontChipText, active ? styles.fontChipTextActive : null]}>
                                {option.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.textControlSection}>
                      <Text style={styles.textControlLabel}>Background</Text>
                      <View style={styles.themeSwatchRow}>
                        {MOMENT_TEXT_THEMES.map((themeOption) => {
                          const active = textStyle.themeId === themeOption.id;
                          return (
                            <Pressable
                              key={themeOption.id}
                              style={styles.themeSwatchButton}
                              onPress={() => handleSelectTextTheme(themeOption.id)}
                            >
                              <LinearGradientSafe
                                colors={[...themeOption.gradient]}
                                start={[0, 0]}
                                end={[1, 1]}
                                style={[
                                  styles.themeSwatch,
                                  {
                                    backgroundColor: themeOption.gradient[0],
                                    borderColor: active ? theme.tint : withAlpha(theme.text, isDark ? 0.14 : 0.1),
                                  },
                                  active ? styles.themeSwatchActive : null,
                                ]}
                              />
                              <Text style={[styles.themeSwatchLabel, active ? styles.themeSwatchLabelActive : null]}>
                                {themeOption.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <TextInput
                      value={textBody}
                      onChangeText={setTextBody}
                      style={[styles.textArea, textEditorStyle]}
                      placeholder="Say something thoughtful..."
                      placeholderTextColor={placeholderColor}
                      multiline
                      maxLength={240}
                      textAlignVertical="top"
                      onLayout={(event) => {
                        textAreaYRef.current = textStudioYRef.current + event.nativeEvent.layout.y;
                      }}
                      onFocus={() => {
                        setActiveFocusTarget('text');
                        if (Platform.OS === 'android' && keyboardHeight > 0) {
                          scrollInputIntoView(textAreaYRef.current || textStudioYRef.current, 24);
                        }
                      }}
                    />

                    {textPreview ? (
                      <View style={styles.textPreviewWrap}>
                        <Text style={styles.textPreviewEyebrow}>Preview</Text>
                        <TextMomentCard
                          body={textPreview}
                          caption={caption.trim()}
                          metadata={textMetadata}
                          variant="editor"
                        />
                      </View>
                    ) : null}

                    <Pressable
                      style={styles.primaryButton}
                      onPress={() => {
                        haptics.medium();
                        void handleCreateText();
                      }}
                      disabled={saving}
                    >
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

                <View
                  style={styles.captionPanel}
                  onLayout={(event) => {
                    captionPanelYRef.current = event.nativeEvent.layout.y;
                  }}
                >
                  <Text style={styles.captionLabel}>Set the mood</Text>
                  <TextInput
                    value={caption}
                    onChangeText={setCaption}
                    style={styles.captionInput}
                    placeholder="Optional caption"
                    placeholderTextColor={placeholderColor}
                    maxLength={80}
                    onFocus={() => {
                      setActiveFocusTarget('caption');
                      if (Platform.OS === 'android' && keyboardHeight > 0) {
                        scrollInputIntoView(captionPanelYRef.current, 28);
                      }
                    }}
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
              </View>
            </BlurViewSafe>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
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
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    screenGlow: {
      ...StyleSheet.absoluteFillObject,
    },
    keyboardWrap: {
      flex: 1,
    },
    successShell: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 24,
    },
    successSheet: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      borderRadius: 28,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
      backgroundColor: withAlpha(theme.background, isDark ? 0.98 : 0.96),
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.24 : 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
      elevation: 14,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 16,
      paddingTop: 24,
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
      shadowOpacity: isDark ? 0.24 : 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
      elevation: 14,
    },
    blur: { borderRadius: 28, overflow: 'hidden' },
    hero: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 18,
    },
    successHero: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 16,
      overflow: 'hidden',
    },
    successHeroGlow: {
      position: 'absolute',
      right: -24,
      top: -14,
      width: 170,
      height: 170,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(25,210,212,0.12)' : 'rgba(25,210,212,0.08)',
    },
    successBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      alignSelf: 'flex-start',
      height: 30,
      paddingHorizontal: 12,
      marginBottom: 14,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.background, isDark ? 0.22 : 0.62),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.1 : 0.06),
    },
    successBadgeText: {
      color: theme.text,
      fontSize: 12,
      fontFamily: 'Manrope_800ExtraBold',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    sourceContextCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginTop: 14,
      padding: 14,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.background, isDark ? 0.2 : 0.64),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.2 : 0.12),
    },
    sourceContextIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.1),
    },
    sourceContextCopy: {
      flex: 1,
      gap: 3,
    },
    sourceContextTitle: {
      color: theme.text,
      fontSize: 13,
      fontFamily: 'Archivo_700Bold',
    },
    sourceContextBody: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: 'Manrope_600SemiBold',
    },
    successTitle: {
      color: theme.text,
      fontFamily: 'PlayfairDisplay_700Bold',
      fontSize: 32,
      lineHeight: 38,
      marginBottom: 8,
    },
    successSubtitle: {
      color: theme.textMuted,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: 'Manrope_700Bold',
      maxWidth: 320,
      marginBottom: 8,
    },
    successSupportCopy: {
      color: withAlpha(theme.textMuted, 0.9),
      fontSize: 12,
      lineHeight: 18,
      fontFamily: 'Manrope_600SemiBold',
      maxWidth: 340,
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
    primaryCaptureBody: { flex: 1 },
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
    momentGateCard: {
      marginTop: 14,
      borderRadius: 22,
      padding: 16,
      backgroundColor: withAlpha(theme.accent, isDark ? 0.12 : 0.08),
      borderWidth: 1,
      borderColor: withAlpha(theme.accent, isDark ? 0.2 : 0.12),
    },
    momentGateHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    momentGateTitle: {
      flex: 1,
      color: theme.text,
      fontFamily: 'Archivo_700Bold',
      fontSize: 15,
    },
    momentGateBody: {
      color: theme.textMuted,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 13,
      lineHeight: 20,
    },
    momentGateActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
    },
    momentGateSecondaryButton: {
      flex: 1,
      minHeight: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.background, isDark ? 0.24 : 0.72),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.1 : 0.08),
    },
    momentGateSecondaryButtonText: {
      color: theme.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
    },
    momentGatePrimaryButton: {
      flex: 1,
      minHeight: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.tint,
    },
    momentGatePrimaryButtonText: {
      color: Colors.light.background,
      fontFamily: 'Manrope_800ExtraBold',
      fontSize: 13,
    },
    momentNudgeCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 14,
      padding: 14,
      borderRadius: 18,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.08 : 0.06),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
    },
    momentNudgeIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.background, isDark ? 0.22 : 0.68),
    },
    momentNudgeBody: {
      flex: 1,
    },
    momentNudgeTitle: {
      color: theme.text,
      fontFamily: 'Archivo_700Bold',
      fontSize: 14,
      marginBottom: 4,
    },
    momentNudgeCopy: {
      color: theme.textMuted,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 12,
      lineHeight: 18,
    },
    successContent: {
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 18,
    },
    successPreviewCard: {
      borderRadius: 22,
      padding: 14,
      backgroundColor: withAlpha(theme.text, isDark ? 0.055 : 0.04),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.1 : 0.07),
    },
    successPhoto: {
      width: '100%',
      aspectRatio: 1.05,
      borderRadius: 18,
    },
    successMediaFallback: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 18,
      padding: 14,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.08 : 0.06),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
    },
    successMediaIcon: {
      width: 54,
      height: 54,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.background, isDark ? 0.2 : 0.58),
    },
    successMediaBody: {
      flex: 1,
    },
    successMediaTitle: {
      color: theme.text,
      fontFamily: 'Archivo_700Bold',
      fontSize: 15,
      marginBottom: 4,
    },
    successMediaCopy: {
      color: theme.textMuted,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 12,
      lineHeight: 18,
    },
    successTextCard: {
      borderRadius: 18,
      padding: 16,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.08 : 0.06),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.18 : 0.12),
    },
    successTextEyebrow: {
      color: theme.textMuted,
      fontFamily: 'Manrope_800ExtraBold',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    successTextBody: {
      color: theme.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 16,
      lineHeight: 24,
    },
    successCaptionWrap: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: withAlpha(theme.text, isDark ? 0.08 : 0.06),
    },
    successCaptionLabel: {
      color: theme.textMuted,
      fontFamily: 'Manrope_800ExtraBold',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 6,
    },
    successCaptionText: {
      color: theme.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
      lineHeight: 20,
    },
    successActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 16,
    },
    successSecondaryButton: {
      height: 48,
      paddingHorizontal: 16,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.background, isDark ? 0.24 : 0.64),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.08 : 0.06),
    },
    successSecondaryButtonText: {
      color: theme.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
    },
    successPrimaryButton: {
      flex: 1,
      borderRadius: 16,
      overflow: 'hidden',
    },
    successPrimaryButtonFill: {
      minHeight: 48,
      borderRadius: 16,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    successPrimaryButtonBody: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    optionGrid: {
      flexDirection: 'row',
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
    disabledSurface: {
      opacity: 0.52,
    },
    optionTileWide: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    textMomentRow: {
      marginTop: 12,
      width: '100%',
      justifyContent: 'space-between',
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
    optionTileWideBody: { flex: 1 },
    textMomentIconWrap: {
      marginBottom: 0,
    },
    textMomentArrow: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.text, isDark ? 0.05 : 0.04),
    },
    previewPanel: {
      marginTop: 16,
      padding: 16,
      borderRadius: 22,
      backgroundColor: withAlpha(theme.tint, isDark ? 0.08 : 0.06),
      borderWidth: 1,
      borderColor: withAlpha(theme.tint, isDark ? 0.2 : 0.12),
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    previewEyebrow: {
      color: theme.text,
      fontFamily: 'Manrope_800ExtraBold',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    previewTypePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      height: 28,
      borderRadius: 999,
      backgroundColor: withAlpha(theme.background, isDark ? 0.28 : 0.62),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.08 : 0.06),
    },
    previewTypePillText: {
      color: theme.textMuted,
      fontFamily: 'Manrope_700Bold',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    photoPreview: {
      width: '100%',
      aspectRatio: 1.05,
      borderRadius: 18,
      marginBottom: 12,
      backgroundColor: theme.backgroundSubtle,
    },
    videoPreviewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 18,
      padding: 14,
      marginBottom: 12,
      backgroundColor: withAlpha(theme.background, isDark ? 0.2 : 0.58),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.08 : 0.06),
    },
    videoPreviewIcon: {
      width: 52,
      height: 52,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.tint, isDark ? 0.14 : 0.1),
    },
    videoPreviewBody: { flex: 1 },
    videoPreviewTitle: {
      color: theme.text,
      fontFamily: 'Archivo_700Bold',
      fontSize: 15,
      marginBottom: 4,
    },
    videoPreviewCopy: {
      color: theme.textMuted,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 12,
      lineHeight: 18,
    },
    previewActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    previewSecondaryButton: {
      height: 48,
      paddingHorizontal: 16,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.background, isDark ? 0.24 : 0.64),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.08 : 0.06),
    },
    previewSecondaryButtonText: {
      color: theme.text,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
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
    textControlSection: {
      marginBottom: 12,
    },
    textControlLabel: {
      color: theme.text,
      fontFamily: 'Archivo_700Bold',
      fontSize: 12,
      marginBottom: 8,
    },
    textToggleRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    textToggleChip: {
      minWidth: 40,
      height: 38,
      paddingHorizontal: 12,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.text, isDark ? 0.04 : 0.035),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.1 : 0.08),
    },
    textToggleChipActive: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.1),
      borderColor: withAlpha(theme.tint, isDark ? 0.34 : 0.22),
    },
    textToggleChipText: {
      color: theme.textMuted,
      fontFamily: 'Manrope_800ExtraBold',
      fontSize: 14,
    },
    textToggleChipTextActive: {
      color: theme.text,
    },
    textToggleItalic: {
      fontStyle: 'italic',
    },
    textToggleUnderline: {
      textDecorationLine: 'underline',
    },
    textToggleStrike: {
      textDecorationLine: 'line-through',
    },
    fontChipRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    fontChip: {
      paddingHorizontal: 12,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(theme.text, isDark ? 0.04 : 0.035),
      borderWidth: 1,
      borderColor: withAlpha(theme.text, isDark ? 0.1 : 0.08),
    },
    fontChipActive: {
      backgroundColor: withAlpha(theme.tint, isDark ? 0.16 : 0.1),
      borderColor: withAlpha(theme.tint, isDark ? 0.34 : 0.22),
    },
    fontChipText: {
      color: theme.textMuted,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
    },
    fontChipTextActive: {
      color: theme.text,
    },
    themeSwatchRow: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
    },
    themeSwatchButton: {
      alignItems: 'center',
      gap: 6,
    },
    themeSwatch: {
      width: 42,
      height: 42,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.1),
    },
    themeSwatchActive: {
      borderColor: theme.tint,
      transform: [{ scale: 1.04 }],
    },
    themeSwatchLabel: {
      color: theme.textMuted,
      fontFamily: 'Manrope_700Bold',
      fontSize: 10,
    },
    themeSwatchLabelActive: {
      color: theme.text,
    },
    textPreviewWrap: {
      marginBottom: 12,
    },
    textPreviewEyebrow: {
      color: theme.textMuted,
      fontFamily: 'Manrope_800ExtraBold',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 6,
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
