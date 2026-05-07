import type { EdgeInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";

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

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function getVibesDeviceSize(screenWidth: number, screenHeight: number): VibesDeviceSize {
  return {
    compactHeight: screenHeight < 760,
    mediumHeight: screenHeight >= 760 && screenHeight < 850,
    tallHeight: screenHeight >= 850,
    compactWidth: screenWidth < 390,
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
  const actionDockSize = device.compactHeight || device.compactWidth ? 50 : device.tallHeight ? 58 : 54;
  const actionDockBottom = Math.max(insets.bottom + (platform === "android" ? 4 : 6), 8);
  const actionDockOverlap = device.compactHeight ? 52 : device.mediumHeight ? 44 : 22;
  const stackBottomReserve = actionDockSize + actionDockBottom + (device.compactHeight ? 26 : 34);
  const availableHeight = screenHeight - insets.top - insets.bottom - (device.compactHeight ? 326 : device.mediumHeight ? 350 : 374);
  const aspectHeight = cardWidth * (device.compactHeight ? 1.08 : device.mediumHeight ? 1.2 : 1.28);
  const screenRatioHeight = screenHeight * (device.compactHeight ? 0.455 : device.mediumHeight ? 0.505 : 0.535);
  const maxCardHeight = device.tallHeight ? 548 : device.mediumHeight ? 458 : 398;
  const minCardHeight = device.compactHeight ? 334 : 386;
  const cardHeight = clamp(Math.min(aspectHeight, screenRatioHeight, availableHeight), minCardHeight, maxCardHeight);
  const cardBorderRadius = device.compactHeight || device.compactWidth ? 24 : 28;
  const nameFontSize = device.compactHeight || device.compactWidth ? 26 : device.tallHeight ? 31 : 29;
  const overlayBottom = Math.max(34, actionDockOverlap + (device.compactHeight ? 28 : 18));

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

