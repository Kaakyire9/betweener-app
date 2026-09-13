import {
  Eye,
  Hand,
  Heart,
  HeartHandshake,
  Lightbulb,
  PartyPopper,
  Smile,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';
import { memo } from 'react';

import type { LiveReactionKind } from '../application/index.ts';

const REACTION_ICONS: Readonly<Record<LiveReactionKind, LucideIcon>> = {
  heart: Heart,
  spark: Sparkles,
  applause: Hand,
  support: HeartHandshake,
  joy: Smile,
  wow: Eye,
  insight: Lightbulb,
  celebrate: PartyPopper,
};

type Props = {
  color: string;
  kind: LiveReactionKind;
  size?: number;
};

export const LiveReactionGlyph = memo(function LiveReactionGlyph({
  color,
  kind,
  size = 20,
}: Props) {
  const Icon = REACTION_ICONS[kind];
  return (
    <Icon
      color={color}
      fill={kind === 'heart' ? color : 'none'}
      size={size}
      strokeWidth={1.9}
    />
  );
});
