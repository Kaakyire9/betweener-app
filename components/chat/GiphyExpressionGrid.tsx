import { Image as ExpoImage } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
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
    if (mode === 'animated-text') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setFailed(false);
      void fetchChatGifs({ query, signal: controller.signal, platform: 'web' })
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

  if (mode === 'animated-text') {
    return (
      <View style={styles.state}>
        <Text style={[styles.stateTitle, { color: textColor }]}>Animated text is mobile-first</Text>
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {results.map((gif) => (
            <Pressable
              key={gif.id}
              testID={`chat-expression-gif-${gif.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Send GIF: ${gif.title}`}
              style={[styles.card, { backgroundColor: withAlpha(textColor, isDark ? 0.1 : 0.06) }]}
              onPress={() => onSelect(gif)}
            >
              <ExpoImage
                source={{ uri: gif.previewUrl }}
                style={styles.image}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={140}
                autoplay
              />
            </Pressable>
          ))}
        </View>
        <Text style={[styles.attribution, { color: mutedTextColor }]}>Powered by GIPHY</Text>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 13, paddingBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  card: { width: '49%', height: 118, borderRadius: 16, overflow: 'hidden' },
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
