import { Platform, useWindowDimensions } from "react-native";
import { useMemo } from "react";
import { useSafeAreaInsets, type EdgeInsets } from "react-native-safe-area-context";
import { RESPONSIVE_RESERVES, clamp } from "@/lib/responsive";
import {
  getVibesLayoutMetrics,
  type VibesLayoutMetrics,
} from "../VibesResponsiveLayout";

export type VibesDepthMetrics = VibesLayoutMetrics & {
  isCompactHeight: boolean;
  isMediumHeight: boolean;
  isTallHeight: boolean;
  isCompactWidth: boolean;
  cardRadius: number;
  cardBottomContentHeight: number;
  dockHeight: number;
  dockWidth: number;
  dockBottom: number;
  buttonSize: number;
  centerButtonSize: number;
  tabHeight: number;
  topSpacing: number;
  locationFontSize: number;
  chipFontSize: number;
  bottomNavReserve: number;
  shouldCompressVerticalSpacing: boolean;
  shouldHideNonEssentialBadges: boolean;
};

type MetricsInput = {
  screenWidth?: number;
  screenHeight?: number;
  insets?: EdgeInsets;
  platform?: typeof Platform.OS;
};

export function deriveVibesDepthMetrics({
  screenWidth,
  screenHeight,
  insets,
  platform = Platform.OS,
}: Required<MetricsInput>): VibesDepthMetrics {
  const base = getVibesLayoutMetrics({ screenWidth, screenHeight, insets, platform });
  const { compactHeight, mediumHeight, tallHeight, compactWidth } = base.device;
  const shouldCompressVerticalSpacing = compactHeight || compactWidth;
  const buttonSize = compactHeight || compactWidth ? 44 : tallHeight ? 52 : 48;
  const centerButtonSize = compactHeight || compactWidth ? 52 : tallHeight ? 62 : 58;
  const dockHeight = compactHeight || compactWidth ? 58 : tallHeight ? 64 : 64;
  const dockWidth = clamp(base.cardWidth - (compactWidth ? 50 : tallHeight ? 56 : 42), 270, 372);
  const bottomNavReserve = Math.max(
    insets.bottom + RESPONSIVE_RESERVES.compactBottomTabBar,
    platform === "android" ? 82 : 86
  );

  return {
    ...base,
    isCompactHeight: compactHeight,
    isMediumHeight: mediumHeight,
    isTallHeight: tallHeight,
    isCompactWidth: compactWidth,
    cardRadius: base.cardBorderRadius,
    cardBottomContentHeight: Math.max(132, base.cardHeight * (compactHeight ? 0.34 : 0.38)),
    dockHeight,
    dockWidth,
    dockBottom: Math.max(platform === "android" ? 3 : 4, insets.bottom + (platform === "android" ? 0 : tallHeight ? 0 : 2)),
    buttonSize,
    centerButtonSize,
    tabHeight: compactHeight || compactWidth ? 48 : 54,
    topSpacing: compactHeight ? 8 : 12,
    locationFontSize: compactHeight ? 13 : 14,
    chipFontSize: compactHeight || compactWidth ? 11 : 12,
    bottomNavReserve,
    shouldCompressVerticalSpacing,
    shouldHideNonEssentialBadges: compactHeight && compactWidth,
  };
}

export default function useVibesResponsiveMetrics(input: MetricsInput = {}): VibesDepthMetrics {
  const dimensions = useWindowDimensions();
  const safeInsets = useSafeAreaInsets();
  const screenWidth = input.screenWidth ?? dimensions.width;
  const screenHeight = input.screenHeight ?? dimensions.height;
  const insets = input.insets ?? safeInsets;
  const platform = input.platform ?? Platform.OS;

  return useMemo(
    () => deriveVibesDepthMetrics({ screenWidth, screenHeight, insets, platform }),
    [insets, platform, screenHeight, screenWidth],
  );
}
