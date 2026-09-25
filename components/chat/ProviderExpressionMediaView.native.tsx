import type { ChatProviderMediaReference } from '@/lib/chat/expressions/chat-gif-provider';
import { getChatGifApiKey } from '@/lib/chat/expressions/chat-gif-provider';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  reference: ChatProviderMediaReference;
  autoPlay: boolean;
  transparent: boolean;
  style?: StyleProp<ViewStyle>;
  fallback: ReactNode;
};

type GiphySdkModule = typeof import('@giphy/react-native-sdk');

let resolvedSdk: GiphySdkModule | null | undefined;
const resolveSdk = () => {
  if (resolvedSdk !== undefined) return resolvedSdk;
  try {
    // Older OTA clients may not contain the native SDK yet.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    resolvedSdk = require('@giphy/react-native-sdk') as GiphySdkModule;
  } catch {
    resolvedSdk = null;
  }
  return resolvedSdk;
};

const nativeSdk = resolveSdk();
const nativeApiKey = getChatGifApiKey(Platform.OS === 'ios' ? 'ios' : 'android');
if (nativeSdk && nativeApiKey) {
  nativeSdk.GiphySDK.configure({ apiKey: nativeApiKey, videoCacheMaxBytes: 64 * 1024 * 1024 });
}

export default function ProviderExpressionMediaView({
  reference,
  autoPlay,
  transparent,
  style,
  fallback,
}: Props) {
  if (!nativeSdk || !nativeApiKey) return <>{fallback}</>;
  const GiphyMediaView = nativeSdk.GiphyMediaView;
  return (
    <View style={[styles.container, style]}>
      <GiphyMediaView
        media={{ id: reference.providerMediaId }}
        autoPlay={autoPlay}
        renditionType="fixed_width"
        resizeMode={transparent ? 'contain' : 'cover'}
        showCheckeredBackground={false}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});
