import type { EdgeInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { RESPONSIVE_BREAKPOINTS, clamp } from "@/lib/responsive";

export type VibesDeviceSize = {
  compactHeight: boolean;
  mediumHeight: boolean;
  tallHeight: boolean;
  compactWidth: boolean;
};

export type VibesLayoutMetrics = {
  device: VibesDeviceSize;
  cardWidth: number;
  cardHeight: number;
  imageHeight: number;
  actionDockBottom: number;
  actionDockSize: number;
  actionDockOverlap: number;
  stackBottomReserve: number;
  cardBorderRadius: number;
  nameFontSize: number;
  overlayPadding: {
    horizontal: number;
    top: number;
    bottom: number;
  };
  topRowInset: number;
};

type MetricsInput = {
  screenWidth: number;
  screenHeight: number;
  insets: EdgeInsets;
  platform?: typeof Platform.OS;
};

export function getVibesDeviceSize(screenWidth: number, screenHeight: number): VibesDeviceSize {
  return {
    compactHeight: screenHeight < RESPONSIVE_BREAKPOINTS.compactHeight,
    mediumHeight:
      screenHeight >= RESPONSIVE_BREAKPOINTS.compactHeight &&
      screenHeight < RESPONSIVE_BREAKPOINTS.mediumHeight,
    tallHeight: screenHeight >= RESPONSIVE_BREAKPOINTS.tallHeight,
    compactWidth: screenWidth < RESPONSIVE_BREAKPOINTS.compactWidth,
  };
}

export function getVibesLayoutMetrics({
  screenWidth,
  screenHeight,
  insets,
  platform = Platform.OS,
}: MetricsInput): VibesLayoutMetrics {
  const device = getVibesDeviceSize(screenWidth, screenHeight);
  const horizontalInset = device.compactWidth ? 16 : 20;
  const cardWidth = clamp(screenWidth - horizontalInset * 2, 312, 430);
  const actionDockSize = device.compactHeight || device.compactWidth ? 44 : device.tallHeight ? 52 : 49;
  const actionDockBottom = Math.max(insets.bottom + (platform === "android" ? 4 : 6), 8);
  const actionDockOverlap = device.compactHeight ? 72 : device.mediumHeight ? 64 : 42;
  const stackBottomReserve = actionDockSize + actionDockBottom + (device.compactHeight ? 34 : device.tallHeight ? 58 : 44);
  const availableHeight = screenHeight - insets.top - insets.bottom - (device.compactHeight ? 314 : device.mediumHeight ? 342 : 392);
  const aspectHeight = cardWidth * (device.compactHeight ? 1.13 : device.mediumHeight ? 1.26 : 1.27);
  const screenRatioHeight = screenHeight * (device.compactHeight ? 0.478 : device.mediumHeight ? 0.526 : 0.512);
  const maxCardHeight = device.tallHeight ? 540 : device.mediumHeight ? 486 : 420;
  const minCardHeight = device.compactHeight ? 334 : 386;
  const cardHeight = clamp(Math.min(aspectHeight, screenRatioHeight, availableHeight), minCardHeight, maxCardHeight);
  const cardBorderRadius = device.compactHeight || device.compactWidth ? 25 : device.tallHeight ? 32 : 30;
  const nameFontSize = device.compactHeight || device.compactWidth ? 26 : device.tallHeight ? 29 : 29;
  const overlayBottom = device.compactHeight ? 118 : device.mediumHeight ? 112 : device.tallHeight ? 116 : 100;

  return {
    device,
    cardWidth,
    cardHeight,
    imageHeight: cardHeight,
    actionDockBottom,
    actionDockSize,
    actionDockOverlap,
    stackBottomReserve,
    cardBorderRadius,
    nameFontSize,
    overlayPadding: {
      horizontal: device.compactWidth ? 15 : 18,
      top: device.compactHeight ? 16 : 20,
      bottom: overlayBottom,
    },
    topRowInset: device.compactHeight || device.compactWidth ? 16 : 22,
  };
}
