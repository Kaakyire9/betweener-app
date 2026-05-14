import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMemo } from "react";

export const RESPONSIVE_BREAKPOINTS = {
  compactWidth: 390,
  mediumWidth: 430,
  tabletWidth: 768,
  compactHeight: 760,
  mediumHeight: 850,
  tallHeight: 850,
} as const;

export const RESPONSIVE_RESERVES = {
  bottomTabBar: 76,
  compactBottomTabBar: 70,
  topHeader: 64,
  compactTopHeader: 56,
  minTapTarget: 44,
} as const;

export const clamp = (value: number, min: number, max: number) => {
  "worklet";
  return Math.max(min, Math.min(value, max));
};

export const lerp = (from: number, to: number, progress: number) => {
  "worklet";
  return from + (to - from) * progress;
};

export type ResponsiveMetrics = ReturnType<typeof createResponsiveMetrics>;

export function createResponsiveMetrics({
  width,
  height,
  insets,
  platform = Platform.OS,
}: {
  width: number;
  height: number;
  insets: { top: number; right: number; bottom: number; left: number };
  platform?: typeof Platform.OS;
}) {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const isLandscape = width > height;
  const usableWidth = Math.max(0, width - insets.left - insets.right);
  const usableHeight = Math.max(0, height - insets.top - insets.bottom);

  const compactWidth = usableWidth < RESPONSIVE_BREAKPOINTS.compactWidth;
  const mediumWidth =
    usableWidth >= RESPONSIVE_BREAKPOINTS.compactWidth &&
    usableWidth < RESPONSIVE_BREAKPOINTS.mediumWidth;
  const widePhone = usableWidth >= RESPONSIVE_BREAKPOINTS.mediumWidth;
  const tablet = shortSide >= RESPONSIVE_BREAKPOINTS.tabletWidth;

  const compactHeight = usableHeight < RESPONSIVE_BREAKPOINTS.compactHeight;
  const mediumHeight =
    usableHeight >= RESPONSIVE_BREAKPOINTS.compactHeight &&
    usableHeight < RESPONSIVE_BREAKPOINTS.mediumHeight;
  const tallHeight = usableHeight >= RESPONSIVE_BREAKPOINTS.tallHeight;

  const widthScale = clamp(usableWidth / 390, 0.9, tablet ? 1.16 : 1.08);
  const heightScale = clamp(usableHeight / 844, 0.88, tablet ? 1.14 : 1.08);
  const balancedScale = clamp((widthScale + heightScale) / 2, 0.88, tablet ? 1.14 : 1.06);

  const horizontalGutter = compactWidth ? 16 : tablet ? 32 : 20;
  const contentMaxWidth = tablet ? 560 : 430;
  const contentWidth = Math.min(usableWidth - horizontalGutter * 2, contentMaxWidth);

  const bottomNavReserve =
    (compactHeight ? RESPONSIVE_RESERVES.compactBottomTabBar : RESPONSIVE_RESERVES.bottomTabBar) +
    insets.bottom;

  const topHeaderReserve =
    (compactHeight ? RESPONSIVE_RESERVES.compactTopHeader : RESPONSIVE_RESERVES.topHeader) +
    insets.top;

  const space = (value: number, options?: { min?: number; max?: number }) =>
    Math.round(clamp(value * balancedScale, options?.min ?? 0, options?.max ?? value * 1.18));

  const font = (value: number, options?: { min?: number; max?: number }) =>
    Math.round(clamp(value * widthScale, options?.min ?? value - 2, options?.max ?? value + 2));

  return {
    width,
    height,
    insets,
    platform,
    isIOS: platform === "ios",
    isAndroid: platform === "android",
    isLandscape,
    usableWidth,
    usableHeight,
    shortSide,
    longSide,
    compactWidth,
    mediumWidth,
    widePhone,
    tablet,
    compactHeight,
    mediumHeight,
    tallHeight,
    widthScale,
    heightScale,
    balancedScale,
    horizontalGutter,
    contentMaxWidth,
    contentWidth,
    bottomNavReserve,
    topHeaderReserve,
    minTapTarget: RESPONSIVE_RESERVES.minTapTarget,
    space,
    font,
  };
}

export function useResponsiveMetrics() {
  const dimensions = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(
    () =>
      createResponsiveMetrics({
        width: dimensions.width,
        height: dimensions.height,
        insets,
      }),
    [dimensions.height, dimensions.width, insets]
  );
}
