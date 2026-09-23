import type { GiphyMedia, GiphyTheme } from '@giphy/react-native-sdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
} from 'react-native';

import type { GiphyExpressionGridProps } from '@/components/chat/GiphyExpressionGrid.types';
import { parseChatGifProviderResult } from '@/lib/chat/expressions/chat-gif-provider';
import { withAlpha } from '@/lib/chat/ui/color-utils';

let configuredPlatformKey = '';
type GiphySdkModule = typeof import('@giphy/react-native-sdk');
let resolvedSdk: GiphySdkModule | null | undefined;

const getSdk = () => {
  if (resolvedSdk !== undefined) return resolvedSdk;
  try {
    // Keep older OTA/dev clients safe until their native GIPHY module is rebuilt.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    resolvedSdk = require('@giphy/react-native-sdk') as GiphySdkModule;
  } catch {
    resolvedSdk = null;
  }
  return resolvedSdk;
};

const configureSdk = (sdk: GiphySdkModule | null, apiKey: string) => {
  if (!sdk) return false;
  if (!apiKey) return false;
  const signature = `${Platform.OS}:${apiKey}`;
  if (configuredPlatformKey !== signature) {
    sdk.GiphySDK.configure({ apiKey, videoCacheMaxBytes: 64 * 1024 * 1024 });
    configuredPlatformKey = signature;
  }
  return true;
};

const mapSelectedMedia = (media: GiphyMedia, fallbackTitle: string) => {
  const parsed = parseChatGifProviderResult(media.data);
  if (!parsed) return null;
  return {
    ...parsed,
    title: parsed.title === 'GIF' && fallbackTitle ? fallbackTitle : parsed.title,
  };
};

export default function GiphyExpressionGrid({
  apiKey,
  query,
  mode,
  isDark,
  tint,
  textColor,
  mutedTextColor,
  onSelect,
}: GiphyExpressionGridProps) {
  const [settledQuery, setSettledQuery] = useState(query.trim().slice(0, 80));
  const [hasResults, setHasResults] = useState(true);
  const [selectionError, setSelectionError] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  const sdk = getSdk();
  const configured = configureSdk(sdk, apiKey);

  useEffect(() => {
    const timer = setTimeout(() => setSettledQuery(query.trim().slice(0, 80)), 280);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [mode, reveal, settledQuery]);

  const content = useMemo(() => {
    if (!sdk) return undefined;
    if (mode === 'animated-text') {
      return settledQuery
        ? sdk.GiphyContent.animate({ searchQuery: settledQuery, rating: sdk.GiphyRating.G })
        : undefined;
    }
    return settledQuery
      ? sdk.GiphyContent.search({
        searchQuery: settledQuery,
        mediaType: sdk.GiphyMediaType.Gif,
        rating: sdk.GiphyRating.G,
      })
      : sdk.GiphyContent.trendingGifs({ rating: sdk.GiphyRating.G });
  }, [mode, sdk, settledQuery]);

  const sdkTheme = useMemo<GiphyTheme>(() => ({
    preset: isDark ? 'dark' : 'light',
    backgroundColor: isDark ? '#0d1d1e' : '#fffaf5',
    backgroundColorForLoadingCells: withAlpha(textColor, isDark ? 0.1 : 0.055),
    cellCornerRadius: 16,
    defaultTextColor: textColor,
    retryButtonBackgroundColor: tint,
    retryButtonTextColor: '#ffffff',
    stickerBackgroundColor: withAlpha(tint, isDark ? 0.12 : 0.07),
  }), [isDark, textColor, tint]);

  const selectMedia = useCallback((event: NativeSyntheticEvent<{ media: GiphyMedia }>) => {
    const gif = mapSelectedMedia(event.nativeEvent.media, settledQuery || 'Animated reaction');
    if (!gif) {
      setSelectionError(true);
      return;
    }
    setSelectionError(false);
    onSelect(gif);
  }, [onSelect, settledQuery]);

  if (!configured || !sdk) {
    return (
      <View style={styles.state}>
        <Text style={[styles.stateTitle, { color: textColor }]}>GIPHY needs a platform key</Text>
        <Text style={[styles.stateCopy, { color: mutedTextColor }]}>Add the iOS or Android SDK key and rebuild the app.</Text>
      </View>
    );
  }

  const GiphyGrid = sdk.GiphyGridView;

  if (mode === 'animated-text' && !settledQuery) {
    return (
      <View style={styles.state}>
        <Text style={[styles.animatedMark, { color: tint }]}>Aa</Text>
        <Text style={[styles.stateTitle, { color: textColor }]}>Animate your words</Text>
        <Text style={[styles.stateCopy, { color: mutedTextColor }]}>Type a phrase above to create expressive moving text.</Text>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: reveal,
          transform: [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }],
        },
      ]}
    >
      {content ? (
        <GiphyGrid
          key={`${mode}:${settledQuery}`}
          content={content}
          cellPadding={4}
          fixedSizeCells={false}
          onContentUpdate={(event) => setHasResults(event.nativeEvent.resultCount > 0)}
          onMediaSelect={selectMedia}
          renditionType="fixed_width"
          showCheckeredBackground={mode === 'animated-text'}
          spanCount={2}
          style={styles.grid}
          theme={sdkTheme}
        />
      ) : null}
      {!hasResults ? (
        <View pointerEvents="none" style={styles.emptyOverlay}>
          <Text style={[styles.stateTitle, { color: textColor }]}>No expressions found</Text>
          <Text style={[styles.stateCopy, { color: mutedTextColor }]}>Try a shorter or more familiar phrase.</Text>
        </View>
      ) : null}
      {selectionError ? (
        <Text accessibilityLiveRegion="polite" style={[styles.selectionError, { color: mutedTextColor }]}>This GIF format cannot be sent. Choose another.</Text>
      ) : null}
      <Text style={[styles.attribution, { color: mutedTextColor }]}>Powered by GIPHY</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 10 },
  grid: { flex: 1 },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 38,
    gap: 9,
  },
  animatedMark: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 34,
    lineHeight: 39,
  },
  stateTitle: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 18,
    lineHeight: 23,
    textAlign: 'center',
  },
  stateCopy: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 38,
  },
  selectionError: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 8,
    paddingTop: 4,
    textAlign: 'center',
  },
  attribution: {
    paddingVertical: 7,
    textAlign: 'center',
    fontFamily: 'Archivo_700Bold',
    fontSize: 11,
    letterSpacing: 0.7,
  },
});
