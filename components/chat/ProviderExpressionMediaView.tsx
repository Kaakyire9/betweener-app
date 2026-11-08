import type { ChatProviderMediaReference } from '@/lib/chat/expressions/chat-gif-provider';
import {
  getChatGifApiKey,
  parseChatGifProviderResult,
} from '@/lib/chat/expressions/chat-gif-provider';
import { Image as ExpoImage } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  reference: ChatProviderMediaReference;
  autoPlay: boolean;
  transparent: boolean;
  style?: StyleProp<ViewStyle>;
  fallback: ReactNode;
};

export default function ProviderExpressionMediaView({
  reference,
  autoPlay,
  transparent,
  style,
  fallback,
}: Props) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = getChatGifApiKey('web');
    if (!apiKey) {
      setUri(null);
      return;
    }
    const controller = new AbortController();
    const endpoint = `https://api.giphy.com/v1/gifs/${encodeURIComponent(reference.providerMediaId)}?api_key=${encodeURIComponent(apiKey)}&rating=g`;
    void fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`giphy_media_${response.status}`);
        const body = await response.json() as { data?: unknown };
        const parsed = parseChatGifProviderResult(body.data, reference.kind);
        setUri(parsed?.originalUrl ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUri(null);
      });
    return () => controller.abort();
  }, [reference.kind, reference.providerMediaId]);

  if (!uri) return <>{fallback}</>;
  return (
    <View style={[styles.container, style]}>
      <ExpoImage
        source={{ uri }}
        recyclingKey={`${reference.providerMediaId}:${uri}`}
        style={StyleSheet.absoluteFill}
        cachePolicy="none"
        contentFit={transparent ? 'contain' : 'cover'}
        autoplay={autoPlay}
        transition={100}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});
