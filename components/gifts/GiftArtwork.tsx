import { getGiftArtworkAsset } from "@/lib/gifts/gift-artwork";
import { getGiftMeta } from "@/lib/gifts/gift-meta";
import {
  cacheOfflineImage,
  getOfflineImageUri,
  persistOfflineImageCopy,
} from "@/lib/offline/image-store";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Asset } from "expo-asset";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";

type GiftArtworkProps = {
  giftType?: string | null;
  size?: number;
  animate?: boolean;
};

export default function GiftArtwork({
  giftType,
  size = 160,
  animate = true,
}: GiftArtworkProps) {
  const meta = getGiftMeta(giftType);
  const asset = getGiftArtworkAsset(giftType);
  const [assetFailed, setAssetFailed] = useState(false);
  const [resolvedAssetUri, setResolvedAssetUri] = useState<string | null>(null);
  const [assetSourceMode, setAssetSourceMode] = useState<"cached" | "module">("cached");
  const spin = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const assetSourceKey = useMemo(
    () => `gift-art:${String(giftType || "default").trim().toLowerCase() || "default"}`,
    [giftType],
  );

  useEffect(() => {
    setAssetFailed(false);
    setResolvedAssetUri(null);
    setAssetSourceMode("cached");
  }, [giftType]);

  useEffect(() => {
    let cancelled = false;

    const preloadAsset = async () => {
      const cachedUri = await getOfflineImageUri(assetSourceKey);
      if (!cancelled && cachedUri) {
        setResolvedAssetUri(cachedUri);
      }

      if (!asset?.source || typeof asset.source !== "number") {
        return;
      }

      try {
        const expoAsset = Asset.fromModule(asset.source);
        if (expoAsset.localUri) {
          const persistedLocalUri =
            await persistOfflineImageCopy(assetSourceKey, expoAsset.localUri, expoAsset.uri);
          if (!cancelled) setResolvedAssetUri(persistedLocalUri ?? expoAsset.localUri);
          return;
        }
        await expoAsset.downloadAsync();
        if (expoAsset.localUri) {
          const persistedLocalUri =
            await persistOfflineImageCopy(assetSourceKey, expoAsset.localUri, expoAsset.uri);
          if (!cancelled) {
            setResolvedAssetUri(persistedLocalUri ?? expoAsset.localUri ?? expoAsset.uri ?? null);
          }
          return;
        }
        if (expoAsset.uri?.startsWith("http")) {
          const downloadedUri = await cacheOfflineImage(assetSourceKey, expoAsset.uri);
          if (!cancelled) {
            setResolvedAssetUri(downloadedUri ?? expoAsset.uri ?? null);
          }
          return;
        }
      } catch {
        // Keep any cached local URI already loaded above.
      }
    };

    void preloadAsset();

    return () => {
      cancelled = true;
    };
  }, [asset, assetSourceKey]);

  useEffect(() => {
    if (!animate) return;

    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 12000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    spinLoop.start();
    floatLoop.start();
    shimmerLoop.start();

    return () => {
      spinLoop.stop();
      floatLoop.stop();
      shimmerLoop.stop();
    };
  }, [animate, float, shimmer, spin]);

  const orbitRotation = useMemo(
    () =>
      spin.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
      }),
    [spin],
  );

  const floatY = useMemo(
    () =>
      float.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -6],
      }),
    [float],
  );

  const shimmerOpacity = useMemo(
    () =>
      shimmer.interpolate({
        inputRange: [0, 1],
        outputRange: [0.45, 1],
      }),
    [shimmer],
  );

  const shellSize = size;
  const orbSize = size * 0.68;
  const iconSize = size * 0.26;
  const orbitSize = size * 0.9;
  const assetSize = orbSize * (asset?.scale ?? 0.56);
  const showOrbit = size >= 72;
  const showInnerSparkle = size >= 92;

  const assetTilt = useMemo(
    () =>
      float.interpolate({
        inputRange: [0, 1],
        outputRange: ["-4deg", "4deg"],
      }),
    [float],
  );

  return (
    <View style={[styles.root, { width: shellSize, height: shellSize }]}>
      <View style={[styles.glow, { width: shellSize, height: shellSize, backgroundColor: meta.glow }]} />

      {showOrbit ? (
        <Animated.View
          style={[
            styles.orbitWrap,
            {
              width: orbitSize,
              height: orbitSize,
              borderRadius: orbitSize / 2,
              transform: [{ rotate: orbitRotation }],
            },
          ]}
        >
          <View style={[styles.sparkleDot, { top: -6, left: orbitSize * 0.46, backgroundColor: meta.accent }]} />
          <MaterialCommunityIcons
            name="star-four-points"
            size={Math.max(12, size * 0.1)}
            color={meta.accent}
            style={[styles.sparkleIcon, { top: orbitSize * 0.18, right: -2 }]}
          />
          <MaterialCommunityIcons
            name="star-four-points"
            size={Math.max(10, size * 0.08)}
            color={meta.accent}
            style={[styles.sparkleIcon, { bottom: orbitSize * 0.16, left: 2 }]}
          />
        </Animated.View>
      ) : null}

      <Animated.View
        style={[
          styles.floatWrap,
          {
            width: orbSize,
            height: orbSize,
            borderRadius: orbSize / 2,
            transform: [{ translateY: floatY }],
          },
        ]}
      >
        <LinearGradient
          colors={meta.gradient}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[styles.orb, { borderRadius: orbSize / 2 }]}
        >
          <Animated.View style={[styles.highlight, { opacity: shimmerOpacity }]} />
          {asset && !assetFailed ? (
            <>
              <View style={styles.innerPlate} />
              <Animated.View
                style={[
                  styles.assetWrap,
                  {
                    transform:
                      giftType === "ring"
                        ? [{ rotate: orbitRotation }]
                        : [{ rotate: assetTilt }],
                  },
                ]}
              >
                <Image
                  source={
                    assetSourceMode === "cached" && resolvedAssetUri
                      ? { uri: resolvedAssetUri }
                      : asset.source
                  }
                  resizeMode="contain"
                  fadeDuration={0}
                  onError={() => {
                    if (assetSourceMode === "cached" && asset?.source) {
                      setAssetSourceMode("module");
                      return;
                    }
                    setAssetFailed(true);
                  }}
                  style={[
                    styles.assetImage,
                    {
                      width: assetSize,
                      height: assetSize,
                    },
                  ]}
                />
              </Animated.View>
            </>
          ) : (
            <View style={styles.innerPlate}>
              <MaterialCommunityIcons name={meta.icon} size={iconSize} color={meta.accent} />
            </View>
          )}
          {showInnerSparkle ? (
            <MaterialCommunityIcons
              name="star-four-points"
              size={Math.max(12, size * 0.1)}
              color={meta.accent}
              style={styles.innerSparkle}
            />
          ) : null}
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.95,
    transform: [{ scale: 0.86 }],
  },
  orbitWrap: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  sparkleDot: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    opacity: 0.86,
  },
  sparkleIcon: {
    position: "absolute",
  },
  floatWrap: {
    overflow: "visible",
  },
  orb: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 10,
    overflow: "hidden",
  },
  highlight: {
    position: "absolute",
    top: "10%",
    left: "16%",
    width: "54%",
    height: "28%",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.24)",
    transform: [{ rotate: "-18deg" }],
  },
  innerPlate: {
    width: "60%",
    height: "60%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 12, 18, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  assetImage: {
    zIndex: 2,
  },
  assetWrap: {
    position: "absolute",
    zIndex: 2,
  },
  innerSparkle: {
    position: "absolute",
    bottom: "8%",
    right: "12%",
  },
});
