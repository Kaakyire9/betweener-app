import { Image as ExpoImage, type ImageContentFit, type ImageContentPosition } from "expo-image";
import React, { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle, type ImageStyle } from "react-native";

type OfflineImageProps = {
  uri?: string | null;
  style: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  contentPosition?: ImageContentPosition;
  transition?: number;
  cachePolicy?: "none" | "disk" | "memory" | "memory-disk";
  fallback?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  onError?: () => void;
  onLoad?: () => void;
};

export default function OfflineImage({
  uri,
  style,
  contentFit = "cover",
  contentPosition,
  transition = 0,
  cachePolicy = "disk",
  fallback = null,
  containerStyle,
  onError,
  onLoad,
}: OfflineImageProps) {
  const [failed, setFailed] = useState(false);
  const normalizedUri = typeof uri === "string" ? uri.trim() : "";
  const hasUri = normalizedUri.length > 0;

  useEffect(() => {
    setFailed(false);
  }, [normalizedUri]);

  if (!hasUri || failed) {
    return (
      <View style={[style, styles.fallbackBase, containerStyle]}>
        {fallback}
      </View>
    );
  }

  return (
    <ExpoImage
      source={{ uri: normalizedUri }}
      style={style}
      cachePolicy={cachePolicy}
      contentFit={contentFit}
      contentPosition={contentPosition}
      transition={transition}
      onLoad={onLoad}
      onError={() => {
        setFailed(true);
        onError?.();
      }}
    />
  );
}

const styles = StyleSheet.create({
  fallbackBase: {
    overflow: "hidden",
  },
});
