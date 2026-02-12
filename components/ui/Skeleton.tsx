import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";

type Props = {
  height: number;
  width?: number | string;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
};

export function SkeletonBlock({ height, width = "100%", radius = 16, style }: Props) {
  const scheme = useColorScheme();
  const theme = Colors[scheme ?? "light"];
  const isDark = (scheme ?? "light") === "dark";

  const base = isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)";
  const highlight = isDark ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.12)";

  const shimmer = useRef(new Animated.Value(0)).current;
  const [measuredWidth, setMeasuredWidth] = useState<number>(0);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);

  const translateX = useMemo(() => {
    const w = measuredWidth || (typeof width === "number" ? width : 240);
    return shimmer.interpolate({
      inputRange: [0, 1],
      outputRange: [-w, w],
    });
  }, [measuredWidth, shimmer, width]);

  const containerStyle = useMemo(
    () => [
      {
        height,
        width,
        borderRadius: radius,
        backgroundColor: base,
        overflow: "hidden",
      } as const,
      style as any,
    ],
    [base, height, radius, style, width]
  );

  return (
    <View
      style={containerStyle}
      onLayout={(e) => setMeasuredWidth(e.nativeEvent.layout.width)}
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { transform: [{ translateX }], opacity: 0.9 },
        ]}
      >
        <LinearGradient
          colors={[base, highlight, base]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

export function ChatListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      {Array.from({ length: count }).map((_, idx) => (
        <View key={idx} style={styles.row}>
          <SkeletonBlock height={54} width={54} radius={999} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <SkeletonBlock height={14} width="60%" radius={8} />
            <SkeletonBlock height={12} width="85%" radius={8} style={{ marginTop: 10 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ExploreCardSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={styles.card}>
        <SkeletonBlock height={340} width="100%" radius={28} />
        <View style={styles.cardMeta}>
          <SkeletonBlock height={18} width="70%" radius={10} />
          <SkeletonBlock height={14} width="45%" radius={10} style={{ marginTop: 10 }} />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <SkeletonBlock height={26} width={90} radius={999} />
            <SkeletonBlock height={26} width={70} radius={999} />
            <SkeletonBlock height={26} width={84} radius={999} />
          </View>
        </View>
      </View>
    </View>
  );
}

export function ExploreStackSkeleton() {
  return (
    <View style={{ paddingTop: 12 }}>
      <View style={{ transform: [{ scale: 0.985 }], opacity: 0.7 }}>
        <ExploreCardSkeleton />
      </View>
      <View style={{ position: "absolute", top: 10, left: 0, right: 0, transform: [{ scale: 0.97 }], opacity: 0.4 }}>
        <ExploreCardSkeleton />
      </View>
    </View>
  );
}

export function ProfileHeroSkeleton() {
  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
      <SkeletonBlock height={22} width="66%" radius={10} />
      <SkeletonBlock height={14} width="42%" radius={10} style={{ marginTop: 10 }} />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
        <SkeletonBlock height={28} width={110} radius={999} />
        <SkeletonBlock height={28} width={90} radius={999} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  card: {
    borderRadius: 28,
    overflow: "hidden",
  },
  cardMeta: {
    paddingTop: 14,
    paddingHorizontal: 6,
  },
});
