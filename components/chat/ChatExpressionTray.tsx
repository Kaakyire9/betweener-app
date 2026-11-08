import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import GiphyExpressionGrid from '@/components/chat/GiphyExpressionGrid';
import ProviderExpressionMediaView from '@/components/chat/ProviderExpressionMediaView';
import type { GiphyExpressionMode } from '@/components/chat/GiphyExpressionGrid.types';
import {
  CHAT_EMOJI_GROUPS,
  filterChatEmojis,
} from '@/lib/chat/expressions/chat-expression-catalog';
import {
  EMPTY_CHAT_EXPRESSION_PREFERENCES,
  loadChatExpressionPreferences,
  recordRecentExpression,
  recordRecentProviderExpression,
  saveChatExpressionPreferences,
  toggleFavouriteProviderExpression,
  toggleFavouriteSticker,
  type ChatExpressionPreferences,
} from '@/lib/chat/expressions/chat-expression-preferences';
import {
  getChatGifApiKey,
  type ChatProviderExpressionSelection,
} from '@/lib/chat/expressions/chat-gif-provider';
import type { ChatStickerDefinition } from '@/lib/chat-stickers';
import { MOOD_STICKERS } from '@/lib/chat-stickers';
import { withAlpha } from '@/lib/chat/ui/color-utils';

type ExpressionTab = 'emoji' | 'stickers' | 'gifs';
type EmojiSource = 'classic' | 'animated';
type StickerSource = 'betweener' | 'animated';
type Theme = typeof Colors.light;

let expressionSessionTab: ExpressionTab = 'stickers';
let expressionSessionQueries: Record<ExpressionTab, string> = {
  emoji: '',
  stickers: '',
  gifs: '',
};

type Props = {
  visible: boolean;
  ownerUserId?: string | null;
  theme: Theme;
  isDark: boolean;
  onClose: () => void;
  onInsertEmoji: (emoji: string) => void;
  onSendSticker: (sticker: ChatStickerDefinition) => void;
  onSendGif: (gif: ChatProviderExpressionSelection) => void;
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
  ownerUserId,
  theme,
  isDark,
  onClose,
  onInsertEmoji,
  onSendSticker,
  onSendGif,
}: Props) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [mounted, setMounted] = useState(visible);
  const [activeTab, setActiveTab] = useState<ExpressionTab>(expressionSessionTab);
  const [giphyMode, setGiphyMode] = useState<GiphyExpressionMode>('gifs');
  const [emojiSource, setEmojiSource] = useState<EmojiSource>('classic');
  const [stickerSource, setStickerSource] = useState<StickerSource>('animated');
  const [queries, setQueries] = useState<Record<ExpressionTab, string>>(
    expressionSessionQueries,
  );
  const [expanded, setExpanded] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [previewExpression, setPreviewExpression] = useState<ChatProviderExpressionSelection | null>(null);
  const [previewSticker, setPreviewSticker] = useState<ChatStickerDefinition | null>(null);
  const [selectedEmojiGroupId, setSelectedEmojiGroupId] = useState('smileys');
  const [preferences, setPreferences] = useState<ChatExpressionPreferences>(
    EMPTY_CHAT_EXPRESSION_PREFERENCES,
  );
  const animation = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const searchInputRef = useRef<TextInput | null>(null);
  const suppressNextStickerPressRef = useRef(false);
  const gifPlatform = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
    ? Platform.OS
    : 'unknown';
  const gifApiKey = getChatGifApiKey(gifPlatform);
  const query = queries[activeTab];
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
    void loadChatExpressionPreferences(ownerUserId).then((value) => {
      if (!cancelled) setPreferences(value);
    });
    return () => {
      cancelled = true;
    };
  }, [ownerUserId]);

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      setMounted(true);
      Animated.timing(animation, {
        toValue: 1,
        duration: reduceMotion ? 0 : 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(animation, {
      toValue: 0,
      duration: reduceMotion ? 0 : 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [animation, reduceMotion, visible]);

  const persistPreferences = useCallback((next: ChatExpressionPreferences) => {
    setPreferences(next);
    void saveChatExpressionPreferences(next, ownerUserId).catch(() => {});
  }, [ownerUserId]);

  const updateQuery = useCallback((value: string) => {
    const next = { ...queries, [activeTab]: value };
    expressionSessionQueries = next;
    setQueries(next);
  }, [activeTab, queries]);

  const selectTab = useCallback((tab: ExpressionTab) => {
    expressionSessionTab = tab;
    setActiveTab(tab);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (previewExpression) {
        setPreviewExpression(null);
        return true;
      }
      if (previewSticker) {
        setPreviewSticker(null);
        suppressNextStickerPressRef.current = false;
        return true;
      }
      if (searchFocused) {
        searchInputRef.current?.blur();
        Keyboard.dismiss();
        return true;
      }
      if (query) {
        updateQuery('');
        return true;
      }
      if (expanded) {
        setExpanded(false);
        return true;
      }
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [expanded, onClose, previewExpression, previewSticker, query, searchFocused, updateQuery, visible]);

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

  const previewCuratedSticker = useCallback((sticker: ChatStickerDefinition) => {
    suppressNextStickerPressRef.current = true;
    Haptics.selectionAsync().catch(() => {});
    setPreviewSticker(sticker);
  }, []);

  const pressCuratedSticker = useCallback((sticker: ChatStickerDefinition) => {
    if (suppressNextStickerPressRef.current) {
      suppressNextStickerPressRef.current = false;
      return;
    }
    selectSticker(sticker);
  }, [selectSticker]);

  const providerExpressionIsFavourite = useCallback((item: ChatProviderExpressionSelection) => (
    preferences.favouriteProviderExpressions.some(
      (candidate) => candidate.providerMediaId === item.providerMediaId && candidate.kind === item.kind,
    )
  ), [preferences.favouriteProviderExpressions]);

  const sendProviderExpression = useCallback((item: ChatProviderExpressionSelection) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    persistPreferences(recordRecentProviderExpression(preferences, item));
    setPreviewExpression(null);
    onSendGif(item);
  }, [onSendGif, persistPreferences, preferences]);

  const selectProviderExpression = useCallback((item: ChatProviderExpressionSelection) => {
    sendProviderExpression(item);
  }, [sendProviderExpression]);

  const favouriteProviderExpression = useCallback((item: ChatProviderExpressionSelection) => {
    Haptics.selectionAsync().catch(() => {});
    persistPreferences(toggleFavouriteProviderExpression(preferences, item));
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
    const packs = ['Favourites', 'Essentials', 'Everyday'] as const;
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
  const compactHeight = Math.max(292, Math.min(390, windowHeight * 0.43));
  const expandedHeight = Math.max(compactHeight, Math.min(620, windowHeight - insets.top - 150));
  const trayHeight = expanded ? expandedHeight : compactHeight;
  const emojiColumns = windowWidth >= 700 ? 10 : windowWidth >= 390 ? 8 : 7;
  const providerQuickItems = useMemo(() => {
    if (!showProviderGrid || query.trim()) return [];
    const expectedKind = providerMode === 'gifs'
      ? 'giphy_gif'
      : providerMode === 'animated-text'
        ? 'giphy_text'
        : providerMode === 'emoji'
          ? 'giphy_emoji'
          : 'giphy_sticker';
    const seen = new Set<string>();
    return [
      ...preferences.favouriteProviderExpressions,
      ...preferences.recentProviderExpressions,
    ].filter((item) => {
      const identity = `${item.kind}:${item.providerMediaId}`;
      if (item.kind !== expectedKind || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    }).slice(0, 12);
  }, [preferences.favouriteProviderExpressions, preferences.recentProviderExpressions, providerMode, query, showProviderGrid]);

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
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse expressions' : 'Expand expressions'}
          accessibilityHint="Changes how much of the expression catalogue is visible"
          accessibilityState={{ expanded }}
          hitSlop={8}
          style={styles.handleButton}
          onPress={() => setExpanded((current) => !current)}
        >
          <View style={styles.handle} />
        </Pressable>
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
                selectTab(tab.id);
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
          ref={searchInputRef}
          testID="chat-expression-search"
          value={query}
          onChangeText={updateQuery}
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
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
        {query ? (
          <Pressable accessibilityLabel="Clear search" onPress={() => updateQuery('')}>
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
        <View style={styles.flex}>
          {providerQuickItems.length > 0 ? (
            <View style={styles.providerQuickSection}>
              <View style={styles.providerQuickLead}>
                <MaterialCommunityIcons name="history" size={14} color={theme.tint} />
                <Text style={styles.providerQuickLabel}>Quick</Text>
              </View>
              <View style={styles.providerQuickDivider} />
              <ScrollView
                horizontal
                style={styles.providerQuickScroll}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.providerQuickContent}
              >
                {providerQuickItems.map((item) => {
                  const favourite = providerExpressionIsFavourite(item);
                  return (
                    <Pressable
                      key={`${item.kind}:${item.providerMediaId}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.title}${favourite ? ', favourite' : ''}`}
                      accessibilityHint="Tap to send. Hold to preview and manage favourites."
                      accessibilityActions={[
                        { name: 'activate', label: 'Select expression' },
                        { name: 'favourite', label: favourite ? 'Remove favourite' : 'Add favourite' },
                      ]}
                      style={styles.providerQuickItem}
                      onPress={() => selectProviderExpression(item)}
                      onLongPress={() => setPreviewExpression(item)}
                      onAccessibilityAction={(event) => {
                        if (event.nativeEvent.actionName === 'favourite') {
                          favouriteProviderExpression(item);
                        } else if (event.nativeEvent.actionName === 'activate') {
                          selectProviderExpression(item);
                        }
                      }}
                    >
                      <ProviderExpressionMediaView
                        reference={item}
                        autoPlay={!reduceMotion}
                        transparent={item.kind !== 'giphy_gif'}
                        style={styles.providerQuickImage}
                        fallback={(
                          <View style={[styles.providerQuickImage, styles.providerFallback]}>
                            <MaterialCommunityIcons name="sticker-emoji" size={20} color={theme.textMuted} />
                          </View>
                        )}
                      />
                      {favourite ? (
                        <MaterialCommunityIcons
                          name="heart"
                          size={11}
                          color={theme.tint}
                          style={styles.providerQuickFavourite}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
          <GiphyExpressionGrid
            apiKey={gifApiKey}
            query={query}
            mode={providerMode}
            isDark={isDark}
            tint={theme.tint}
            textColor={theme.text}
            mutedTextColor={theme.textMuted}
            onSelect={selectProviderExpression}
          />
        </View>
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
          <FlatList
            key={`emoji-columns-${emojiColumns}`}
            data={[...selectedEmojiGroup.emojis]}
            numColumns={emojiColumns}
            keyExtractor={(emoji, index) => `${emoji}-${index}`}
            contentContainerStyle={styles.emojiGrid}
            showsVerticalScrollIndicator={false}
            initialNumToRender={emojiColumns * 4}
            windowSize={5}
            renderItem={({ item: emoji, index }) => (
              <Pressable
                testID={`chat-expression-emoji-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Insert ${emoji}`}
                style={[styles.emojiButton, { width: `${100 / emojiColumns}%` }]}
                onPress={() => selectEmoji(emoji)}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            )}
          />
        </View>
      ) : activeTab === 'stickers' ? (
        <ScrollView contentContainerStyle={styles.stickerContent} showsVerticalScrollIndicator={false}>
          {stickerSections.length === 0 ? (
            <Text style={styles.emptyText}>No stickers match that search.</Text>
          ) : stickerSections.map((section) => (
            <View key={section.id} style={styles.stickerSection}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
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
                      accessibilityHint="Tap to send. Hold to preview."
                      accessibilityActions={[
                        { name: 'activate', label: 'Send sticker' },
                        { name: 'preview', label: 'Preview sticker' },
                        { name: 'favourite', label: favourite ? 'Remove favourite' : 'Add favourite' },
                      ]}
                      style={styles.stickerCard}
                      onPress={() => pressCuratedSticker(sticker)}
                      onLongPress={() => previewCuratedSticker(sticker)}
                      delayLongPress={320}
                      onAccessibilityAction={(event) => {
                        if (event.nativeEvent.actionName === 'preview') {
                          previewCuratedSticker(sticker);
                        } else if (event.nativeEvent.actionName === 'favourite') {
                          favouriteSticker(sticker.id);
                        } else if (event.nativeEvent.actionName === 'activate') {
                          selectSticker(sticker);
                        }
                      }}
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
          <Text style={styles.helperText}>Tap to send · Hold to preview</Text>
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
      <Modal
        visible={Boolean(previewExpression || previewSticker)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPreviewExpression(null);
          setPreviewSticker(null);
          suppressNextStickerPressRef.current = false;
        }}
      >
        <View style={styles.previewBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close expression preview"
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setPreviewExpression(null);
              setPreviewSticker(null);
              suppressNextStickerPressRef.current = false;
            }}
          />
          {previewExpression ? (
            <View style={styles.previewCard}>
              <ProviderExpressionMediaView
                reference={{
                  schemaVersion: 1,
                  provider: 'giphy',
                  providerMediaId: previewExpression.providerMediaId,
                  title: previewExpression.title,
                  width: previewExpression.width,
                  height: previewExpression.height,
                  kind: previewExpression.kind,
                }}
                autoPlay={!reduceMotion}
                transparent={previewExpression.kind !== 'giphy_gif'}
                style={[
                  styles.previewImage,
                  previewExpression.width && previewExpression.height
                    ? { aspectRatio: previewExpression.width / previewExpression.height }
                    : null,
                ]}
                fallback={(
                  <View style={[styles.previewImage, styles.providerFallback]}>
                    <MaterialCommunityIcons name="sticker-emoji" size={32} color={theme.textMuted} />
                  </View>
                )}
              />
              <Text style={styles.previewTitle} numberOfLines={2}>{previewExpression.title}</Text>
              <Text style={styles.previewAttribution}>Powered by GIPHY</Text>
              <View style={styles.previewActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={providerExpressionIsFavourite(previewExpression)
                    ? 'Remove from favourites'
                    : 'Add to favourites'}
                  style={styles.previewSecondaryAction}
                  onPress={() => favouriteProviderExpression(previewExpression)}
                >
                  <MaterialCommunityIcons
                    name={providerExpressionIsFavourite(previewExpression) ? 'heart' : 'heart-outline'}
                    size={20}
                    color={theme.tint}
                  />
                  <Text style={styles.previewSecondaryText}>Favourite</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send expression"
                  style={styles.previewSendAction}
                  onPress={() => sendProviderExpression(previewExpression)}
                >
                  <Text style={styles.previewSendText}>Send</Text>
                  <MaterialCommunityIcons name="send" size={18} color="#ffffff" />
                </Pressable>
              </View>
            </View>
          ) : previewSticker ? (
            <View style={styles.previewCard}>
              <LinearGradient
                colors={[
                  withAlpha(previewSticker.color, isDark ? 0.32 : 0.2),
                  withAlpha(previewSticker.color, isDark ? 0.1 : 0.06),
                ]}
                style={styles.previewStickerArtwork}
              >
                <Text style={styles.previewStickerEmoji}>{previewSticker.emoji}</Text>
              </LinearGradient>
              <Text style={styles.previewTitle}>{previewSticker.name}</Text>
              <Text style={styles.previewFirstPartyAttribution}>BETWEENER FAVOURITE</Text>
              <View style={styles.previewActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={preferences.favouriteStickerIds.includes(previewSticker.id)
                    ? 'Remove from favourites'
                    : 'Add to favourites'}
                  style={styles.previewSecondaryAction}
                  onPress={() => favouriteSticker(previewSticker.id)}
                >
                  <MaterialCommunityIcons
                    name={preferences.favouriteStickerIds.includes(previewSticker.id) ? 'heart' : 'heart-outline'}
                    size={20}
                    color={theme.tint}
                  />
                  <Text style={styles.previewSecondaryText}>Favourite</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send sticker"
                  style={styles.previewSendAction}
                  onPress={() => {
                    const sticker = previewSticker;
                    setPreviewSticker(null);
                    suppressNextStickerPressRef.current = false;
                    selectSticker(sticker);
                  }}
                >
                  <Text style={styles.previewSendText}>Send</Text>
                  <MaterialCommunityIcons name="send" size={18} color="#ffffff" />
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
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
  topRow: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  handleButton: {
    minWidth: 54,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 34,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: withAlpha(theme.textMuted, 0.26),
  },
  closeButton: {
    position: 'absolute',
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
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
    marginBottom: 6,
  },
  tab: {
    minWidth: 88,
    height: 34,
    paddingHorizontal: 11,
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
    fontSize: 13,
  },
  tabLabelSelected: { color: theme.tint },
  searchShell: {
    height: 38,
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
    fontSize: 15,
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
  },
  emojiButton: {
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
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stickerCard: { width: '23.2%', minHeight: 70, borderRadius: 15, overflow: 'hidden' },
  stickerGradient: {
    flex: 1,
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: withAlpha(theme.text, isDark ? 0.105 : 0.065),
  },
  stickerEmoji: { fontSize: 29, marginBottom: 2 },
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
    minWidth: 104,
    height: 30,
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
  providerQuickSection: {
    height: 48,
    marginHorizontal: 12,
    marginBottom: 5,
    paddingHorizontal: 6,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: withAlpha(theme.tint, isDark ? 0.055 : 0.035),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(theme.tint, isDark ? 0.18 : 0.1),
  },
  providerQuickLead: {
    height: 40,
    paddingHorizontal: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  providerQuickLabel: {
    color: theme.textMuted,
    fontFamily: 'Archivo_700Bold',
    fontSize: 11,
    letterSpacing: 0.25,
  },
  providerQuickDivider: {
    width: StyleSheet.hairlineWidth,
    height: 25,
    marginHorizontal: 6,
    backgroundColor: withAlpha(theme.text, isDark ? 0.16 : 0.1),
  },
  providerQuickContent: {
    paddingRight: 8,
    gap: 6,
    alignItems: 'center',
  },
  providerQuickScroll: { flex: 1 },
  providerQuickItem: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(theme.text, isDark ? 0.06 : 0.035),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(theme.text, isDark ? 0.14 : 0.08),
  },
  providerQuickImage: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  providerFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(theme.text, isDark ? 0.08 : 0.045),
  },
  providerQuickFavourite: {
    position: 'absolute',
    top: 3,
    right: 3,
  },
  previewBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 12, 13, 0.72)',
  },
  previewCard: {
    width: '100%',
    maxWidth: 390,
    padding: 14,
    borderRadius: 24,
    backgroundColor: isDark ? '#102526' : '#fffaf5',
    borderWidth: 1,
    borderColor: withAlpha(theme.tint, isDark ? 0.34 : 0.18),
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 22,
  },
  previewImage: {
    width: '100%',
    minHeight: 180,
    maxHeight: 340,
    borderRadius: 17,
    backgroundColor: withAlpha(theme.text, isDark ? 0.05 : 0.025),
  },
  previewTitle: {
    color: theme.text,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    marginTop: 10,
  },
  previewAttribution: {
    color: theme.textMuted,
    fontFamily: 'Archivo_700Bold',
    fontSize: 9,
    letterSpacing: 0.7,
    marginTop: 3,
  },
  previewStickerArtwork: {
    height: 230,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewStickerEmoji: {
    fontSize: 116,
    lineHeight: 132,
    includeFontPadding: false,
  },
  previewFirstPartyAttribution: {
    color: theme.textMuted,
    fontFamily: 'Archivo_700Bold',
    fontSize: 9,
    letterSpacing: 0.8,
    marginTop: 3,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  previewSecondaryAction: {
    minHeight: 46,
    paddingHorizontal: 15,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: withAlpha(theme.tint, 0.22),
  },
  previewSecondaryText: {
    color: theme.tint,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  previewSendAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.tint,
  },
  previewSendText: {
    color: '#ffffff',
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
  },
});
