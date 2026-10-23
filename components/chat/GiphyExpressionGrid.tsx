import { Image as ExpoImage } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { GiphyExpressionGridProps } from '@/components/chat/GiphyExpressionGrid.types';
import { fetchChatGifs } from '@/lib/chat/expressions/chat-gif-provider';
import { withAlpha } from '@/lib/chat/ui/color-utils';

/**
 * REST fallback for web and non-native test environments. Native builds resolve
 * GiphyExpressionGrid.native.tsx and use GIPHY's optimized SDK grid.
 */
export default function GiphyExpressionGrid({
  apiKey: _apiKey,
  query,
  mode,
  isDark,
  tint,
  textColor,
  mutedTextColor,
  onSelect,
}: GiphyExpressionGridProps) {
  const [results, setResults] = useState<Awaited<ReturnType<typeof fetchChatGifs>>>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [mode, reveal]);

  useEffect(() => {
    if (mode === 'animated-text' || mode === 'emoji') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setFailed(false);
      void fetchChatGifs({
        query,
        signal: controller.signal,
        platform: 'web',
        kind: mode === 'stickers' ? 'giphy_sticker' : 'giphy_gif',
      })
        .then(setResults)
        .catch((error) => {
          if ((error as Error)?.name !== 'AbortError') setFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, query.trim() ? 320 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, query]);

  if (mode === 'animated-text' || mode === 'emoji') {
    return (
      <View style={styles.state}>
        <Text style={[styles.stateTitle, { color: textColor }]}>Animated expressions are mobile-first</Text>
        <Text style={[styles.stateCopy, { color: mutedTextColor }]}>
          Open Betweener on iOS or Android to turn your words into animated reactions.
        </Text>
      </View>
    );
  }

  if (loading && results.length === 0) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={tint} />
        <Text style={[styles.stateCopy, { color: mutedTextColor }]}>Finding the right reaction…</Text>
      </View>
    );
  }

  if (failed) {
    return (
      <View style={styles.state}>
        <Text style={[styles.stateTitle, { color: textColor }]}>GIFs could not load</Text>
        <Text style={[styles.stateCopy, { color: mutedTextColor }]}>Check your connection and try again.</Text>
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
      <FlatList
        data={results}
        numColumns={2}
        keyExtractor={(gif) => `${gif.kind}:${gif.id}`}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        windowSize={5}
        renderItem={({ item: gif }) => (
          <Pressable
              testID={`chat-expression-gif-${gif.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Select ${mode === 'stickers' ? 'sticker' : 'GIF'}: ${gif.title}`}
            style={[styles.card, { backgroundColor: withAlpha(textColor, isDark ? 0.1 : 0.06) }]}
            onPress={() => onSelect(gif)}
          >
            <ExpoImage
              source={{ uri: gif.previewUrl }}
              style={styles.image}
              contentFit={mode === 'stickers' ? 'contain' : 'cover'}
              cachePolicy="none"
              transition={140}
              autoplay
            />
          </Pressable>
        )}
        ListFooterComponent={(
          <Text style={[styles.attribution, { color: mutedTextColor }]}>Powered by GIPHY</Text>
        )}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 13, paddingBottom: 16 },
  gridRow: { gap: 7, marginBottom: 7 },
  card: { flex: 1, maxWidth: '49%', height: 118, borderRadius: 16, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 38,
    gap: 9,
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
  attribution: {
    marginTop: 13,
    textAlign: 'center',
    fontFamily: 'Archivo_700Bold',
    fontSize: 11,
    letterSpacing: 0.7,
  },
});
