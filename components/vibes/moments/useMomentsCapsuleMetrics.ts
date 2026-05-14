import { Platform } from "react-native";
import { useMemo } from "react";
import { useResponsiveMetrics } from "@/lib/responsive";

export type MomentsCapsuleMetrics = {
  isCompactHeight: boolean;
  isCompactWidth: boolean;
  isTallHeight: boolean;
  capsuleHeight: number;
  capsuleRadius: number;
  avatarSize: number;
  avatarRingSize: number;
  capsuleMarginTop: number;
  capsuleMarginBottom: number;
  capsuleOverlapAmount: number;
  maxVisibleAvatars: number;
  showLabels: boolean;
  showStatusLabels: boolean;
  headerHeight: number;
  shouldUseCompactEmptyState: boolean;
  platform: typeof Platform.OS;
};

export default function useMomentsCapsuleMetrics(): MomentsCapsuleMetrics {
  const responsive = useResponsiveMetrics();

  return useMemo(() => {
    const isCompactHeight = responsive.compactHeight;
    const isCompactWidth = responsive.compactWidth;
    const isTallHeight = responsive.tallHeight;
    const capsuleHeight = isCompactHeight || isCompactWidth ? 72 : isTallHeight ? 76 : 74;
    const capsuleOverlapAmount = isCompactHeight || isCompactWidth ? 0 : 4;

    return {
      isCompactHeight,
      isCompactWidth,
      isTallHeight,
      capsuleHeight,
      capsuleRadius: isCompactHeight || isCompactWidth ? 22 : 26,
      avatarSize: isCompactHeight || isCompactWidth ? 40 : isTallHeight ? 48 : 44,
      avatarRingSize: isCompactHeight || isCompactWidth ? 46 : isTallHeight ? 56 : 52,
      capsuleMarginTop: isCompactHeight ? 6 : 8,
      capsuleMarginBottom: isCompactHeight ? 6 : 8,
      capsuleOverlapAmount,
      maxVisibleAvatars: isCompactWidth || isCompactHeight ? 1 : isTallHeight ? 5 : 4,
      showLabels: !(isCompactWidth || isCompactHeight),
      showStatusLabels: !(isCompactWidth || isCompactHeight),
      headerHeight: isCompactHeight ? 54 : isTallHeight ? 64 : 60,
      shouldUseCompactEmptyState: isCompactWidth || isCompactHeight,
      platform: responsive.platform,
    };
  }, [responsive]);
}
