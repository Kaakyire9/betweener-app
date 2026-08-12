import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import type { ComponentProps } from 'react';
import { Animated, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { withAlpha } from '@/lib/chat/ui/color-utils';
import { formatDateInviteWhen } from '@/lib/chat/ui/message-formatters';
import type { MessageType } from '@/components/chat/types';

type DatePlanMessageHeaderProps = {
  item: MessageType;
  isMyMessage: boolean;
  userAvatar?: string | null;
  peerName: string;
  theme: typeof Colors.light;
  styles: Record<string, any>;
  datePlanStatus: NonNullable<MessageType['dateInvite']>['status'] | 'pending';
  datePlanBadgeLabel: string;
  datePlanBadgeIcon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  isAcceptedDatePlan: boolean;
  acceptedLockInHeaderStyle: any;
  acceptedLockInLiftStyle: any;
};

/** Presentation-only header for an interactive date-plan message. */
const DatePlanMessageHeader = ({
  item,
  isMyMessage,
  userAvatar,
  peerName,
  theme,
  styles,
  datePlanStatus,
  datePlanBadgeLabel,
  datePlanBadgeIcon,
  isAcceptedDatePlan,
  acceptedLockInHeaderStyle,
  acceptedLockInLiftStyle,
}: DatePlanMessageHeaderProps) => (
  <View style={styles.datePlanHeader}>
    <View style={styles.datePlanHeaderTop}>
      <View style={[styles.datePlanBadge, { backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.16) : withAlpha(theme.tint, 0.14) }]}>
        <MaterialCommunityIcons name={datePlanBadgeIcon} size={14} color={isMyMessage ? Colors.light.background : theme.tint} />
        <Text style={[styles.datePlanBadgeText, { color: isMyMessage ? Colors.light.background : theme.tint }]}>
          {datePlanBadgeLabel}
        </Text>
      </View>
      {userAvatar ? (
        <View style={[styles.datePlanPersonChip, {
          backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.12) : withAlpha(theme.tint, 0.1),
          borderColor: isMyMessage ? withAlpha(Colors.light.background, 0.14) : withAlpha(theme.tint, 0.14),
        }]}>
          <ExpoImage source={{ uri: userAvatar }} style={styles.datePlanPersonAvatar} cachePolicy="disk" contentFit="cover" transition={0} />
          <Text style={[styles.datePlanPersonText, { color: isMyMessage ? Colors.light.background : theme.text }]} numberOfLines={1}>
            {isMyMessage ? `For ${peerName || 'your match'}` : peerName || 'Your match'}
          </Text>
        </View>
      ) : null}
    </View>
    {isAcceptedDatePlan ? <Text style={[styles.datePlanWhenEyebrow, { color: isMyMessage ? withAlpha(Colors.light.background, 0.76) : theme.textMuted }]}>Confirmed plan</Text> : null}
    {isAcceptedDatePlan ? (
      <Animated.View style={acceptedLockInHeaderStyle}>
        <View style={[styles.datePlanWhenRowConfirmed, { backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.1) : withAlpha(theme.text, 0.05) }]}>
          <MaterialCommunityIcons name="calendar-check-outline" size={16} color={isMyMessage ? Colors.light.background : theme.tint} />
          <Text style={[styles.datePlanWhen, styles.datePlanWhenConfirmed, { color: isMyMessage ? Colors.light.background : theme.text }]}>
            {item.dateInvite ? formatDateInviteWhen(item.dateInvite.scheduledFor) : 'Date suggestion'}
          </Text>
        </View>
      </Animated.View>
    ) : (
      <Text style={[styles.datePlanWhen, { color: isMyMessage ? Colors.light.background : theme.text }]}>
        {item.dateInvite ? formatDateInviteWhen(item.dateInvite.scheduledFor) : 'Date suggestion'}
      </Text>
    )}
    {datePlanStatus !== 'pending' || item.dateInvite?.conciergeRequested ? (
      <Animated.View style={isAcceptedDatePlan ? acceptedLockInLiftStyle : undefined}>
        <View style={styles.datePlanStatusRow}>
          {datePlanStatus !== 'pending' ? (
            <View style={[styles.datePlanStatusChip, { backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.16) : withAlpha(theme.tint, 0.12) }]}>
              <Text style={[styles.datePlanStatusText, { color: isMyMessage ? Colors.light.background : theme.tint }]}>
                {datePlanStatus === 'accepted' ? 'Confirmed' : datePlanStatus === 'declined' ? 'Passed' : datePlanStatus === 'countered' ? 'Updated' : 'Cancelled'}
              </Text>
            </View>
          ) : null}
          {item.dateInvite?.conciergeRequested ? (
            <View style={[styles.datePlanStatusChip, { backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.12) : withAlpha(theme.text, 0.08) }]}>
              <Text style={[styles.datePlanStatusText, { color: isMyMessage ? Colors.light.background : theme.text }]}>Betweener helping</Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    ) : null}
  </View>
);

export default DatePlanMessageHeader;
