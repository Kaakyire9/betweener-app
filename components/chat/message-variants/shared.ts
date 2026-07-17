import type { ComponentProps } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { MessageType } from "@/components/chat/types";

export type ChatMessageStyles = Record<string, any>;

export const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(
    normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
};

export const formatVoiceDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = `${safeSeconds % 60}`.padStart(2, '0');
  return `${minutes}:${remaining}`;
};

export const getReceiptIconState = (
  status: MessageType['status'],
  isDark: boolean,
): {
  name: ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: string;
  size: number;
} => {
  switch (status) {
    case 'failed':
      return { name: 'alert-circle-outline', color: isDark ? '#FF908B' : '#D14343', size: 14 };
    case 'queued':
      return { name: 'clock-outline', color: isDark ? '#CFE1DD' : '#2F6660', size: 13 };
    case 'read':
      return { name: 'check-all', color: isDark ? '#18E0D2' : '#12B3AC', size: 14 };
    case 'delivered':
      return { name: 'check-all', color: isDark ? '#CAD8D5' : '#245E58', size: 14 };
    case 'sent':
      return { name: 'check', color: isDark ? '#AAB8B4' : '#245E58', size: 14 };
    default:
      return { name: 'clock-outline', color: isDark ? '#C6D7D3' : '#2F6660', size: 13 };
  }
};
