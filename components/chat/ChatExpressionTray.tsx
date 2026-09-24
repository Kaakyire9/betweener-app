import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Colors } from '@/constants/theme';
import GiphyExpressionGrid from '@/components/chat/GiphyExpressionGrid';
import type { GiphyExpressionMode } from '@/components/chat/GiphyExpressionGrid.types';
import {
  CHAT_EMOJI_GROUPS,
  filterChatEmojis,
} from '@/lib/chat/expressions/chat-expression-catalog';
import {
  EMPTY_CHAT_EXPRESSION_PREFERENCES,
  loadChatExpressionPreferences,
  recordRecentExpression,
  saveChatExpressionPreferences,
  toggleFavouriteSticker,
  type ChatExpressionPreferences,
} from '@/lib/chat/expressions/chat-expression-preferences';
import {
  getChatGifApiKey,
  type ChatGifResult,
} from '@/lib/chat/expressions/chat-gif-provider';
import type { ChatStickerDefinition } from '@/lib/chat-stickers';
import { MOOD_STICKERS } from '@/lib/chat-stickers';
import { withAlpha } from '@/lib/chat/ui/color-utils';

type ExpressionTab = 'emoji' | 'stickers' | 'gifs';
type EmojiSource = 'classic' | 'animated';
type StickerSource = 'betweener' | 'animated';
type Theme = typeof Colors.light;

type Props = {
  visible: boolean;
  theme: Theme;
  isDark: boolean;
  onClose: () => void;
  onInsertEmoji: (emoji: string) => void;
  onSendSticker: (sticker: ChatStickerDefinition) => void;
  onSendGif: (gif: ChatGifResult) => void;
};

const TABS: readonly {
  id: ExpressionTab;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { id: 'emoji', label: 'Emoji', icon: 'emoticon-happy-outline' },
  { id: 'stickers', label: 'Stickers', icon: 'sticker-emoji' },
  { id: 'gifs', label: 'GIFs', icon: 'file-gif-box' },
] as const;

const findStickers = (query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return MOOD_STICKERS;
  return MOOD_STICKERS.filter((sticker) => (
    sticker.name.toLowerCase().includes(normalized)
    || sticker.pack.toLowerCase().includes(normalized)
    || sticker.keywords.some((keyword) => keyword.includes(normalized))
  ));
};

export default function ChatExpressionTray({
  visible,
  theme,
  isDark,
  onClose,
  onInsertEmoji,
  onSendSticker,
  onSendGif,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [activeTab, setActiveTab] = useState<ExpressionTab>('stickers');
  const [giphyMode, setGiphyMode] = useState<GiphyExpressionMode>('gifs');
  const [emojiSource, setEmojiSource] = useState<EmojiSource>('classic');
  const [stickerSource, setStickerSource] = useState<StickerSource>('animated');
  const [query, setQuery] = useState('');
  const [selectedEmojiGroupId, setSelectedEmojiGroupId] = useState('smileys');
  const [preferences, setPreferences] = useState<ChatExpressionPreferences>(
    EMPTY_CHAT_EXPRESSION_PREFERENCES,
  );
  const animation = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const gifPlatform = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
    ? Platform.OS
    : 'unknown';
  const gifApiKey = getChatGifApiKey(gifPlatform);
  const gifProviderConfigured = Boolean(gifApiKey);
  const availableTabs = gifProviderConfigured
    ? TABS
    : TABS.filter((tab) => tab.id !== 'gifs');
  const providerMode: GiphyExpressionMode = activeTab === 'emoji'
    ? 'emoji'
    : activeTab === 'stickers'
      ? 'stickers'
      : giphyMode;
  const showProviderGrid = gifProviderConfigured && (
    activeTab === 'gifs'
    || (activeTab === 'emoji' && emojiSource === 'animated')
    || (activeTab === 'stickers' && stickerSource === 'animated')
  );
  const animatedEmojiCatalogue = activeTab === 'emoji' && emojiSource === 'animated';

  useEffect(() => {
    let cancelled = false;
    void loadChatExpressionPreferences().then((value) => {
      if (!cancelled) setPreferences(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      setMounted(true);
      Animated.timing(animation, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(animation, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [animation, visible]);

  const persistPreferences = useCallback((next: ChatExpressionPreferences) => {
    setPreferences(next);
    void saveChatExpressionPreferences(next).catch(() => {});
  }, []);

  const selectEmoji = useCallback((emoji: string) => {
    Haptics.selectionAsync().catch(() => {});
    persistPreferences(recordRecentExpression(preferences, 'emoji', emoji));
    onInsertEmoji(emoji);
  }, [onInsertEmoji, persistPreferences, preferences]);

  const selectSticker = useCallback((sticker: ChatStickerDefinition) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    persistPreferences(recordRecentExpression(preferences, 'sticker', sticker.id));
    onSendSticker(sticker);
  }, [onSendSticker, persistPreferences, preferences]);

  const favouriteSticker = useCallback((stickerId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    persistPreferences(toggleFavouriteSticker(preferences, stickerId));
  }, [persistPreferences, preferences]);

  const stickerSections = useMemo(() => {
    const filtered = findStickers(query);
    const byId = new Map(MOOD_STICKERS.map((sticker) => [sticker.id, sticker] as const));
    const recent = preferences.recentStickerIds
      .map((id) => byId.get(id))
      .filter((sticker): sticker is ChatStickerDefinition => Boolean(sticker))
      .filter((sticker) => filtered.includes(sticker));
    const favourites = preferences.favouriteStickerIds
      .map((id) => byId.get(id))
      .filter((sticker): sticker is ChatStickerDefinition => Boolean(sticker))
      .filter((sticker) => filtered.includes(sticker));
    const packs = ['Between Us', 'Essentials', 'Everyday'] as const;
    return [
      ...(favourites.length ? [{ id: 'favourites', title: 'Favourites', items: favourites }] : []),
      ...(recent.length && !query.trim() ? [{ id: 'recent', title: 'Recently used', items: recent }] : []),
      ...packs.map((pack) => ({
        id: pack,
        title: pack,
        items: filtered.filter((sticker) => sticker.pack === pack),
      })).filter((section) => section.items.length > 0),
    ];
  }, [preferences.favouriteStickerIds, preferences.recentStickerIds, query]);

  const emojiGroups = useMemo(() => {
    const filtered = filterChatEmojis(query);
    if (query.trim() || preferences.recentEmojis.length === 0) return filtered;
    return [{
      id: 'recent',
      label: 'Recent',
      icon: '\u{1F552}',
      emojis: preferences.recentEmojis,
    }, ...filtered];
  }, [preferences.recentEmojis, query]);

  const selectedEmojiGroup = emojiGroups.find((group) => group.id === selectedEmojiGroupId)
    ?? emojiGroups[0]
    ?? CHAT_EMOJI_GROUPS[0];
  const styles = useMemo(() => createStyles(theme, isDark), [isDark, theme]);
  const trayHeight = Math.min(460, Math.max(350, windowHeight * 0.49));

  if (!mounted) return null;

  return (
    <Animated.View
      testID="chat-expression-tray"
      style={[
        styles.container,
        {
          height: trayHeight,
          opacity: animation,
          transform: [{
            translateY: animation.interpolate({
              inputRange: [0, 1],
              outputRange: [26, 0],
            }),
          }],
        },
      ]}
    >
      <View style={styles.handle} />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>BETWEENER EXPRESSIONS</Text>
          <Text style={styles.title}>Say it with feeling</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close expressions"
          hitSlop={8}
          style={styles.closeButton}
          onPress={onClose}
        >
          <MaterialCommunityIcons name="close" size={19} color={theme.textMuted} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {availableTabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              testID={`chat-expression-tab-${tab.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.tab, selected && styles.tabSelected]}
              onPress={() => {
                setActiveTab(tab.id);
                setQuery('');
              }}
            >
              <MaterialCommunityIcons
                name={tab.icon}
                size={16}
                color={selected ? theme.tint : theme.textMuted}
              />
              <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {!animatedEmojiCatalogue ? <View style={styles.searchShell}>
        <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
        <TextInput
          testID="chat-expression-search"
          value={query}
          onChangeText={setQuery}
          placeholder={activeTab === 'gifs'
            ? giphyMode === 'animated-text' ? 'Type words to animate' : 'Search GIFs'
            : activeTab === 'stickers' && gifProviderConfigured && stickerSource === 'animated'
              ? 'Search animated stickers'
              : activeTab === 'emoji' && gifProviderConfigured && emojiSource === 'animated'
                ? 'Search animated emoji'
                : `Search ${activeTab}`}
          placeholderTextColor={withAlpha(theme.textMuted, 0.72)}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query ? (
          <Pressable accessibilityLabel="Clear search" onPress={() => setQuery('')}>
            <MaterialCommunityIcons name="close-circle" size={17} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View> : null}

      {gifProviderConfigured ? (
        <View style={styles.giphyModes} accessibilityRole="tablist">
          {(activeTab === 'emoji'
            ? ([
                { id: 'classic', label: 'Classic', icon: 'emoticon-happy-outline' },
                { id: 'animated', label: 'Animated', icon: 'motion-play-outline' },
              ] as const)
            : activeTab === 'stickers'
              ? ([
                  { id: 'betweener', label: 'Betweener', icon: 'creation' },
                  { id: 'animated', label: 'Animated', icon: 'motion-play-outline' },
                ] as const)
              : ([
                  { id: 'gifs', label: 'GIFs', icon: 'file-gif-box' },
                  { id: 'animated-text', label: 'Animated text', icon: 'format-letter-case' },
                ] as const)
          ).map((mode) => {
            const selected = activeTab === 'emoji'
              ? emojiSource === mode.id
              : activeTab === 'stickers'
                ? stickerSource === mode.id
                : giphyMode === mode.id;
            return (
              <Pressable
                key={mode.id}
                testID={`chat-expression-mode-${activeTab}-${mode.id}`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.giphyMode, selected && styles.giphyModeSelected]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  if (activeTab === 'emoji') setEmojiSource(mode.id as EmojiSource);
                  else if (activeTab === 'stickers') setStickerSource(mode.id as StickerSource);
                  else setGiphyMode(mode.id as GiphyExpressionMode);
                }}
              >
                <MaterialCommunityIcons
                  name={mode.icon}
                  size={18}
                  color={selected ? theme.tint : theme.textMuted}
                />
                <Text style={[styles.giphyModeLabel, selected && styles.giphyModeLabelSelected]}>
                  {mode.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {showProviderGrid ? (
        <GiphyExpressionGrid
          apiKey={gifApiKey}
          query={query}
          mode={providerMode}
          isDark={isDark}
          tint={theme.tint}
          textColor={theme.text}
          mutedTextColor={theme.textMuted}
          onSelect={onSendGif}
        />
      ) : activeTab === 'emoji' ? (
        <View style={styles.flex}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.emojiCategories}
          >
            {emojiGroups.map((group) => {
              const selected = selectedEmojiGroup.id === group.id;
              return (
                <Pressable
                  key={group.id}
                  accessibilityRole="button"
                  accessibilityLabel={group.label}
                  style={[styles.emojiCategory, selected && styles.emojiCategorySelected]}
                  onPress={() => setSelectedEmojiGroupId(group.id)}
                >
                  <Text style={styles.emojiCategoryIcon}>{group.icon}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <ScrollView contentContainerStyle={styles.emojiGrid} showsVerticalScrollIndicator={false}>
            {selectedEmojiGroup.emojis.map((emoji, index) => (
              <Pressable
                key={`${emoji}-${index}`}
                testID={`chat-expression-emoji-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Insert ${emoji}`}
                style={styles.emojiButton}
                onPress={() => selectEmoji(emoji)}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : activeTab === 'stickers' ? (
        <ScrollView contentContainerStyle={styles.stickerContent} showsVerticalScrollIndicator={false}>
          {stickerSections.length === 0 ? (
            <Text style={styles.emptyText}>No stickers match that search.</Text>
          ) : stickerSections.map((section) => (
            <View key={section.id} style={styles.stickerSection}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.id === 'Between Us' ? (
                  <View style={styles.signaturePill}>
                    <MaterialCommunityIcons name="creation" size={11} color={theme.tint} />
                    <Text style={styles.signatureText}>SIGNATURE</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.stickerGrid}>
                {section.items.map((sticker) => {
                  const favourite = preferences.favouriteStickerIds.includes(sticker.id);
                  return (
                    <Pressable
                      key={`${section.id}-${sticker.id}`}
                      testID={`chat-expression-sticker-${sticker.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${sticker.name} sticker${favourite ? ', favourite' : ''}`}
                      accessibilityHint="Tap to send. Hold to favourite."
                      style={styles.stickerCard}
                      onPress={() => selectSticker(sticker)}
                      onLongPress={() => favouriteSticker(sticker.id)}
                      delayLongPress={320}
                    >
                      <LinearGradient
                        colors={[
                          withAlpha(sticker.color, isDark ? 0.3 : 0.18),
                          withAlpha(sticker.color, isDark ? 0.1 : 0.055),
                        ]}
                        style={styles.stickerGradient}
                      >
                        <Text style={styles.stickerEmoji}>{sticker.emoji}</Text>
                        <Text style={styles.stickerName} numberOfLines={1}>{sticker.name}</Text>
                        {favourite ? (
                          <MaterialCommunityIcons
                            name="heart"
                            size={12}
                            color={sticker.color}
                            style={styles.favouriteIcon}
                          />
                        ) : null}
                      </LinearGradient>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          <Text style={styles.helperText}>Tap to send · Hold to favourite</Text>
        </ScrollView>
      ) : !gifProviderConfigured ? (
        <View style={styles.providerState}>
          <View style={styles.providerIcon}>
            <MaterialCommunityIcons name="shield-star-outline" size={25} color={theme.tint} />
          </View>
          <Text style={styles.providerTitle}>Curated GIFs are almost ready</Text>
          <Text style={styles.providerCopy}>
            Stickers and emoji are ready now. GIFs will appear here when the curated catalogue is available.
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const createStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  container: {
    backgroundColor: isDark ? '#0d1d1e' : '#fffaf5',
    borderTopWidth: 1,
    borderTopColor: withAlpha(theme.tint, isDark ? 0.28 : 0.16),
    paddingTop: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: isDark ? 0.24 : 0.09,
    shadowRadius: 24,
    elevation: 16,
  },
  flex: { flex: 1 },
  handle: {
    width: 34,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: withAlpha(theme.textMuted, 0.26),
    marginBottom: 7,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 9,
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
    fontSize: 23,
    lineHeight: 28,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.045),
    borderWidth: 1,
    borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
  },
  tabs: {
    flexDirection: 'row',
    alignSelf: 'center',
    padding: 3,
    borderRadius: 18,
    backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.045),
    marginBottom: 9,
  },
  tab: {
    minWidth: 96,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tabSelected: {
    backgroundColor: isDark ? withAlpha(theme.tint, 0.19) : '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  tabLabel: {
    color: theme.textMuted,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
  },
  tabLabelSelected: { color: theme.tint },
  searchShell: {
    height: 44,
    borderRadius: 21,
    marginHorizontal: 16,
    marginBottom: 7,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: withAlpha(theme.text, isDark ? 0.075 : 0.042),
    borderWidth: 1,
    borderColor: withAlpha(theme.text, isDark ? 0.12 : 0.065),
  },
  searchInput: {
    flex: 1,
    color: theme.text,
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    paddingVertical: 0,
  },
  emojiCategories: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    gap: 7,
  },
  emojiCategory: {
    width: 34,
    height: 31,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiCategorySelected: { backgroundColor: withAlpha(theme.tint, 0.16) },
  emojiCategoryIcon: { fontSize: 19 },
  emojiGrid: {
    paddingHorizontal: 13,
    paddingBottom: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emojiButton: {
    width: '12.5%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  emoji: { fontSize: 30 },
  stickerContent: { paddingHorizontal: 14, paddingBottom: 15 },
  stickerSection: { marginTop: 7 },
  sectionHeading: {
    height: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sectionTitle: {
    color: theme.text,
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  signaturePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    height: 17,
    borderRadius: 8,
    backgroundColor: withAlpha(theme.tint, 0.11),
  },
  signatureText: {
    color: theme.tint,
    fontFamily: 'Archivo_700Bold',
    fontSize: 7,
    letterSpacing: 0.8,
  },
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stickerCard: { width: '31.7%', minHeight: 82, borderRadius: 18, overflow: 'hidden' },
  stickerGradient: {
    flex: 1,
    minHeight: 82,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: withAlpha(theme.text, isDark ? 0.105 : 0.065),
  },
  stickerEmoji: { fontSize: 31, marginBottom: 3 },
  stickerName: {
    color: theme.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    paddingHorizontal: 5,
  },
  favouriteIcon: { position: 'absolute', top: 8, right: 8 },
  helperText: {
    marginTop: 12,
    textAlign: 'center',
    color: withAlpha(theme.textMuted, 0.76),
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
  },
  emptyText: {
    paddingTop: 35,
    textAlign: 'center',
    color: theme.textMuted,
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
  },
  providerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 42,
    gap: 8,
  },
  providerIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(theme.tint, 0.12),
    marginBottom: 3,
  },
  providerTitle: {
    color: theme.text,
    fontFamily: 'Archivo_700Bold',
    fontSize: 18,
    textAlign: 'center',
  },
  providerCopy: {
    color: theme.textMuted,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  giphyModes: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 5,
    padding: 3,
    marginBottom: 7,
    borderRadius: 17,
    backgroundColor: withAlpha(theme.text, isDark ? 0.07 : 0.04),
  },
  giphyMode: {
    minWidth: 112,
    height: 34,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  giphyModeSelected: {
    backgroundColor: isDark ? withAlpha(theme.tint, 0.18) : '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 2,
  },
  giphyModeLabel: {
    color: theme.textMuted,
    fontFamily: 'Archivo_700Bold',
    fontSize: 13,
  },
  giphyModeLabelSelected: { color: theme.tint },
});
