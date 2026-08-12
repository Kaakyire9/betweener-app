import DatePlanMessageHeader from '@/components/chat/message-variants/DatePlanMessageHeader';
import type { MessageType } from '@/components/chat/types';
import type { createChatScreenStyles } from '@/components/chat/styles/chat-screen.styles';
import { Colors } from '@/constants/theme';
import { getDatePlanUiState } from '@/lib/chat/thread-behavior';
import { getDateBadgeMeta, getDateBadgePalette } from '@/lib/chat/ui/date-badge-presentation';
import { withAlpha } from '@/lib/chat/ui/color-utils';
import { Motion } from '@/lib/motion';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, Linking, Text, TouchableOpacity, View } from 'react-native';

type DatePlanMessageContentProps = {
  item: MessageType;
  isMyMessage: boolean;
  userAvatar?: string | null;
  peerName: string;
  theme: typeof Colors.light;
  isDark: boolean;
  styles: ReturnType<typeof createChatScreenStyles>;
  datePlanActionId: string | null;
  datePlanCalendarActionId: string | null;
  onAcceptDatePlan: (planId: string) => void;
  onSuggestAnotherTime: (invite: MessageType['dateInvite']) => void;
  onSuggestAnotherPlace: (invite: MessageType['dateInvite']) => void;
  onSuggestBoth: (invite: MessageType['dateInvite']) => void;
  onRescheduleDatePlan: (invite: MessageType['dateInvite']) => void;
  onCancelDatePlan: (planId: string) => void;
  onRequestDatePlanConcierge: (planId: string) => void;
  onAddDatePlanToCalendar: (invite: MessageType['dateInvite']) => void;
};

export const DatePlanMessageContent = memo(
  ({
    item,
    isMyMessage,
    userAvatar,
    peerName,
    theme,
    isDark,
    styles,
    datePlanActionId,
    datePlanCalendarActionId,
    onAcceptDatePlan,
    onSuggestAnotherTime,
    onSuggestAnotherPlace,
    onSuggestBoth,
    onRescheduleDatePlan,
    onCancelDatePlan,
    onRequestDatePlanConcierge,
    onAddDatePlanToCalendar,
  }: DatePlanMessageContentProps) => {
    const {
      datePlanStatus,
      datePlanPlanId,
      datePlanBusy,
      canAcceptDatePlan,
      canRequestDatePlanConcierge,
      canRescheduleDatePlan,
      canAddDatePlanToCalendar,
      canCancelDatePlan,
      datePlanCalendarBusy,
      datePlanBadgeLabel,
      datePlanBadgeIcon,
      isAcceptedDatePlan,
    } = getDatePlanUiState({
      item,
      isMyMessage,
      datePlanActionId,
      datePlanCalendarActionId,
    });
    const acceptedLockIn = useRef(new Animated.Value(isAcceptedDatePlan ? 1 : 0)).current;
    const previousDatePlanStatus = useRef(datePlanStatus);
    const acceptedLockInHeaderStyle = useMemo(() => ({
      opacity: acceptedLockIn.interpolate({
        inputRange: [0, 1],
        outputRange: [0.72, 1],
      }),
      transform: [
        {
          translateY: acceptedLockIn.interpolate({
            inputRange: [0, 1],
            outputRange: [Motion.transform.enterTranslateY, 0],
          }),
        },
        {
          scale: acceptedLockIn.interpolate({
            inputRange: [0, 0.68, 1],
            outputRange: [0.985, Motion.transform.popScale, 1],
          }),
        },
      ],
    }) as const, [acceptedLockIn]);
    const acceptedLockInLiftStyle = useMemo(() => ({
      opacity: acceptedLockIn.interpolate({
        inputRange: [0, 1],
        outputRange: [0.68, 1],
      }),
      transform: [
        {
          translateY: acceptedLockIn.interpolate({
            inputRange: [0, 1],
            outputRange: [6, 0],
          }),
        },
      ],
    }) as const, [acceptedLockIn]);

    useEffect(() => {
      const previousStatus = previousDatePlanStatus.current;
      if (datePlanStatus === 'accepted' && previousStatus !== 'accepted') {
        acceptedLockIn.stopAnimation();
        acceptedLockIn.setValue(0);
        Animated.timing(acceptedLockIn, {
          toValue: 1,
          duration: Motion.duration.slow,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      } else if (datePlanStatus !== 'accepted') {
        acceptedLockIn.stopAnimation();
        acceptedLockIn.setValue(0);
      }

      previousDatePlanStatus.current = datePlanStatus;
    }, [acceptedLockIn, datePlanStatus]);

    return (
      <View
        style={[
          styles.datePlanMessageContainer,
          isAcceptedDatePlan && styles.datePlanMessageContainerConfirmed,
        ]}
      >
        <DatePlanMessageHeader
          item={item}
          isMyMessage={isMyMessage}
          userAvatar={userAvatar}
          peerName={peerName}
          theme={theme}
          styles={styles}
          datePlanStatus={datePlanStatus}
          datePlanBadgeLabel={datePlanBadgeLabel}
          datePlanBadgeIcon={datePlanBadgeIcon}
          isAcceptedDatePlan={isAcceptedDatePlan}
          acceptedLockInHeaderStyle={acceptedLockInHeaderStyle}
          acceptedLockInLiftStyle={acceptedLockInLiftStyle}
        />
        {/* Legacy header markup retained temporarily for a diff-safe extraction.
            The rendered header above is the component boundary. */}
        {/* <View style={styles.datePlanHeader}>
          <View style={styles.datePlanHeaderTop}>
            <View style={[styles.datePlanBadge, { backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.16) : withAlpha(theme.tint, 0.14) }]}>
              <MaterialCommunityIcons
                name={datePlanBadgeIcon}
                size={14}
                color={isMyMessage ? Colors.light.background : theme.tint}
              />
              <Text style={[styles.datePlanBadgeText, { color: isMyMessage ? Colors.light.background : theme.tint }]}>
                {datePlanBadgeLabel}
              </Text>
            </View>
            {userAvatar ? (
              <View
                style={[
                  styles.datePlanPersonChip,
                  {
                    backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.12) : withAlpha(theme.tint, 0.1),
                    borderColor: isMyMessage ? withAlpha(Colors.light.background, 0.14) : withAlpha(theme.tint, 0.14),
                  },
                ]}
              >
                <ExpoImage
                  source={{ uri: userAvatar }}
                  style={styles.datePlanPersonAvatar}
                  cachePolicy="disk"
                  contentFit="cover"
                  transition={0}
                />
                <Text
                  style={[
                    styles.datePlanPersonText,
                    { color: isMyMessage ? Colors.light.background : theme.text },
                  ]}
                  numberOfLines={1}
                >
                  {isMyMessage ? `For ${peerName || 'your match'}` : peerName || 'Your match'}
                </Text>
              </View>
            ) : null}
          </View>
          {isAcceptedDatePlan ? (
            <Text
              style={[
                styles.datePlanWhenEyebrow,
                { color: isMyMessage ? withAlpha(Colors.light.background, 0.76) : theme.textMuted },
              ]}
            >
              Confirmed plan
            </Text>
          ) : null}
          {isAcceptedDatePlan ? (
            <Animated.View style={acceptedLockInHeaderStyle as any}>
              <View
                style={[
                  styles.datePlanWhenRowConfirmed,
                  {
                    backgroundColor: isMyMessage
                      ? withAlpha(Colors.light.background, 0.1)
                      : withAlpha(theme.text, 0.05),
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="calendar-check-outline"
                  size={16}
                  color={isMyMessage ? Colors.light.background : theme.tint}
                />
                <Text
                  style={[
                    styles.datePlanWhen,
                    styles.datePlanWhenConfirmed,
                    { color: isMyMessage ? Colors.light.background : theme.text },
                  ]}
                >
                  {item.dateInvite ? formatDateInviteWhen(item.dateInvite.scheduledFor) : 'Date suggestion'}
                </Text>
              </View>
            </Animated.View>
          ) : (
            <Text
              style={[
                styles.datePlanWhen,
                { color: isMyMessage ? Colors.light.background : theme.text },
              ]}
            >
              {item.dateInvite ? formatDateInviteWhen(item.dateInvite.scheduledFor) : 'Date suggestion'}
            </Text>
          )}
          {datePlanStatus !== 'pending' || item.dateInvite?.conciergeRequested ? (
            <Animated.View style={isAcceptedDatePlan ? acceptedLockInLiftStyle as any : undefined}>
              <View style={styles.datePlanStatusRow}>
                {datePlanStatus !== 'pending' ? (
                  <View
                    style={[
                      styles.datePlanStatusChip,
                      {
                        backgroundColor: isMyMessage
                          ? withAlpha(Colors.light.background, 0.16)
                          : withAlpha(theme.tint, 0.12),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.datePlanStatusText,
                        { color: isMyMessage ? Colors.light.background : theme.tint },
                      ]}
                    >
                      {datePlanStatus === 'accepted'
                        ? 'Confirmed'
                        : datePlanStatus === 'declined'
                        ? 'Passed'
                        : datePlanStatus === 'countered'
                        ? 'Updated'
                        : 'Cancelled'}
                    </Text>
                  </View>
                ) : null}
                {item.dateInvite?.conciergeRequested ? (
                  <View
                    style={[
                      styles.datePlanStatusChip,
                      {
                        backgroundColor: isMyMessage
                          ? withAlpha(Colors.light.background, 0.12)
                          : withAlpha(theme.text, 0.08),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.datePlanStatusText,
                        { color: isMyMessage ? Colors.light.background : theme.text },
                      ]}
                    >
                      Betweener helping
                    </Text>
                  </View>
                ) : null}
              </View>
            </Animated.View>
          ) : null}
        </View> */}
        {item.dateInvite?.mapUrl ? (
          <Image
            source={{ uri: item.dateInvite.mapUrl }}
            style={[
              styles.datePlanMapImage,
              isAcceptedDatePlan && styles.datePlanMapImageConfirmed,
            ]}
          />
        ) : null}
        <View style={styles.datePlanPlaceBlock}>
          <Text
            style={[
              styles.datePlanVenue,
              isAcceptedDatePlan && styles.datePlanVenueConfirmed,
              { color: isMyMessage ? Colors.light.background : theme.text },
            ]}
            numberOfLines={1}
          >
            {item.dateInvite?.placeName || 'Chosen venue'}
          </Text>
          {item.dateInvite?.placeAddress ? (
            <Text
              style={[
                styles.datePlanAddress,
                isAcceptedDatePlan && styles.datePlanAddressConfirmed,
                { color: isMyMessage ? withAlpha(Colors.light.background, 0.78) : theme.textMuted },
              ]}
              numberOfLines={2}
            >
              {item.dateInvite.placeAddress}
            </Text>
          ) : null}
          {item.dateInvite?.summary ? (
            <Text
              style={[
                styles.datePlanSummary,
                isAcceptedDatePlan && styles.datePlanSummaryConfirmed,
                { color: isMyMessage ? withAlpha(Colors.light.background, 0.78) : theme.textMuted },
              ]}
              numberOfLines={isAcceptedDatePlan ? 1 : 2}
            >
              {item.dateInvite.summary}
            </Text>
          ) : null}
        </View>
        {item.dateInvite?.badges?.length ? (
          <View style={[styles.datePlanBadgeRow, isAcceptedDatePlan && styles.datePlanBadgeRowCompact]}>
            {item.dateInvite.badges.slice(0, 3).map((badge) => {
              const badgeMeta = getDateBadgeMeta(badge);
              const badgePalette = getDateBadgePalette({
                tone: badgeMeta.tone,
                theme,
                isDark,
                surface: 'message',
                isMyMessage,
                confirmed: isAcceptedDatePlan,
              });
              return (
                <View
                  key={badge}
                  style={[
                    styles.datePlanTag,
                    isAcceptedDatePlan && styles.datePlanTagCompact,
                    isAcceptedDatePlan && styles.datePlanTagConfirmed,
                    {
                      backgroundColor: badgePalette.backgroundColor,
                      borderColor: badgePalette.borderColor,
                      borderWidth: 1,
                    },
                  ]}
                >
                  <View style={styles.datePlanTagContent}>
                    <MaterialCommunityIcons
                      name={badgeMeta.icon}
                      size={12}
                      color={badgePalette.foregroundColor}
                      style={styles.datePlanTagIcon}
                    />
                    <Text
                      style={[
                        styles.datePlanTagText,
                        isAcceptedDatePlan && styles.datePlanTagTextCompact,
                        { color: badgePalette.foregroundColor },
                      ]}
                    >
                      {badge}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
        {item.dateInvite?.note ? (
          <View
            style={[
              styles.datePlanNoteCard,
              isAcceptedDatePlan && styles.datePlanNoteCardLight,
              { borderColor: isMyMessage ? withAlpha(Colors.light.background, 0.18) : withAlpha(theme.text, 0.12) },
            ]}
          >
            <Text
              style={[
                styles.datePlanNoteLabel,
                isAcceptedDatePlan && styles.datePlanNoteLabelCompact,
                { color: isMyMessage ? withAlpha(Colors.light.background, 0.7) : theme.textMuted },
              ]}
            >
              Note
            </Text>
            <Text
              style={[
                styles.datePlanNoteText,
                isAcceptedDatePlan && styles.datePlanNoteTextCompact,
                { color: isMyMessage ? Colors.light.background : theme.text },
              ]}
            >
              {item.dateInvite.note}
            </Text>
          </View>
        ) : null}
        {canAcceptDatePlan ? (
          <View style={styles.datePlanActionRow}>
            <TouchableOpacity
              style={[
                styles.datePlanPrimaryAction,
                {
                  backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.14) : theme.tint,
                  opacity: datePlanBusy ? 0.7 : 1,
                },
              ]}
              disabled={datePlanBusy}
              onPress={() => datePlanPlanId && onAcceptDatePlan(datePlanPlanId)}
            >
              <Text
                style={[
                  styles.datePlanPrimaryActionText,
                  { color: Colors.light.background },
                ]}
              >
                {datePlanBusy ? 'Accepting...' : 'Accept'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.datePlanSecondaryAction,
                {
                  borderColor: isMyMessage
                    ? withAlpha(Colors.light.background, 0.2)
                    : withAlpha(theme.text, 0.14),
                  opacity: datePlanBusy ? 0.7 : 1,
                },
              ]}
              disabled={datePlanBusy}
              onPress={() => item.dateInvite && onSuggestAnotherTime(item.dateInvite)}
            >
              <Text
                style={[
                  styles.datePlanSecondaryActionText,
                  { color: isMyMessage ? Colors.light.background : theme.text },
                ]}
              >
                Suggest another time
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.datePlanSecondaryAction,
                {
                  borderColor: isMyMessage
                    ? withAlpha(Colors.light.background, 0.2)
                    : withAlpha(theme.text, 0.14),
                  opacity: datePlanBusy ? 0.7 : 1,
                },
              ]}
              disabled={datePlanBusy}
              onPress={() => item.dateInvite && onSuggestAnotherPlace(item.dateInvite)}
            >
              <Text
                style={[
                  styles.datePlanSecondaryActionText,
                  { color: isMyMessage ? Colors.light.background : theme.text },
                ]}
              >
                Suggest another place
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.datePlanSecondaryAction,
                {
                  borderColor: isMyMessage
                    ? withAlpha(Colors.light.background, 0.2)
                    : withAlpha(theme.text, 0.14),
                  opacity: datePlanBusy ? 0.7 : 1,
                },
              ]}
              disabled={datePlanBusy}
              onPress={() => item.dateInvite && onSuggestBoth(item.dateInvite)}
            >
              <Text
                style={[
                  styles.datePlanSecondaryActionText,
                  { color: isMyMessage ? Colors.light.background : theme.text },
                ]}
              >
                Suggest both
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {canRescheduleDatePlan ? (
          <Animated.View style={acceptedLockInLiftStyle as any}>
            <View style={styles.datePlanActionRow}>
              {canAddDatePlanToCalendar ? (
                <TouchableOpacity
                  style={[
                    styles.datePlanPrimaryAction,
                    styles.datePlanPrimaryActionWide,
                    {
                      backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.16) : theme.tint,
                      opacity: datePlanCalendarBusy ? 0.7 : 1,
                    },
                  ]}
                  disabled={datePlanCalendarBusy}
                  onPress={() => item.dateInvite && onAddDatePlanToCalendar(item.dateInvite)}
                >
                  <View style={styles.datePlanPrimaryActionContent}>
                    <MaterialCommunityIcons
                      name="calendar-plus"
                      size={14}
                      color={Colors.light.background}
                    />
                    <Text
                      style={[
                        styles.datePlanPrimaryActionText,
                        { color: Colors.light.background },
                      ]}
                    >
                      {datePlanCalendarBusy ? 'Adding...' : 'Add to Calendar'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : null}
              {item.dateInvite?.mapLink ? (
                <TouchableOpacity
                  style={[
                    styles.datePlanSecondaryAction,
                    styles.datePlanSecondaryActionStrong,
                    {
                      borderColor: isMyMessage
                        ? withAlpha(Colors.light.background, 0.2)
                        : withAlpha(theme.text, 0.14),
                      opacity: datePlanBusy ? 0.7 : 1,
                    },
                  ]}
                  disabled={datePlanBusy}
                  onPress={() => item.dateInvite?.mapLink && Linking.openURL(item.dateInvite.mapLink).catch(() => {})}
                >
                  <View style={styles.datePlanSecondaryActionContent}>
                    <MaterialCommunityIcons
                      name="map-marker-path"
                      size={14}
                      color={isMyMessage ? Colors.light.background : theme.text}
                    />
                    <Text
                      style={[
                        styles.datePlanSecondaryActionText,
                        { color: isMyMessage ? Colors.light.background : theme.text },
                      ]}
                    >
                      Open in Maps
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.datePlanSecondaryAction,
                  styles.datePlanSecondaryActionStrong,
                  {
                    borderColor: isMyMessage
                      ? withAlpha(Colors.light.background, 0.2)
                      : withAlpha(theme.text, 0.14),
                    opacity: datePlanBusy ? 0.7 : 1,
                  },
                ]}
                disabled={datePlanBusy}
                onPress={() => item.dateInvite && onRescheduleDatePlan(item.dateInvite)}
              >
                <Text
                  style={[
                    styles.datePlanSecondaryActionText,
                    { color: isMyMessage ? Colors.light.background : theme.text },
                  ]}
                >
                  Reschedule date
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : null}
        {isMyMessage && datePlanStatus === 'pending' ? (
          <>
            <Text style={[styles.datePlanPendingText, { color: withAlpha(Colors.light.background, 0.82) }]}>
              Waiting for their reply
            </Text>
            {canCancelDatePlan ? (
              <View style={styles.datePlanActionRow}>
                <TouchableOpacity
                  style={[
                    styles.datePlanSecondaryAction,
                    {
                      borderColor: withAlpha(Colors.light.background, 0.2),
                      opacity: datePlanBusy ? 0.7 : 1,
                    },
                  ]}
                  disabled={datePlanBusy}
                  onPress={() => datePlanPlanId && onCancelDatePlan(datePlanPlanId)}
                >
                  <Text style={[styles.datePlanSecondaryActionText, { color: Colors.light.background }]}>
                    {datePlanBusy ? 'Cancelling...' : 'Cancel suggestion'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : null}
        {canRequestDatePlanConcierge ? (
          <Animated.View style={acceptedLockInLiftStyle as any}>
            <TouchableOpacity
              style={[
                styles.datePlanConciergeButton,
                {
                  borderColor: isMyMessage
                    ? withAlpha(Colors.light.background, 0.22)
                    : withAlpha(theme.tint, 0.18),
                  backgroundColor: isMyMessage
                    ? withAlpha(Colors.light.background, 0.08)
                    : withAlpha(theme.tint, 0.08),
                  opacity: datePlanBusy ? 0.7 : 1,
                },
              ]}
              disabled={datePlanBusy}
              onPress={() => datePlanPlanId && onRequestDatePlanConcierge(datePlanPlanId)}
            >
              <MaterialCommunityIcons
                name="account-tie-hat-outline"
                size={14}
                color={isMyMessage ? Colors.light.background : theme.tint}
              />
              <Text
                style={[
                  styles.datePlanConciergeText,
                  { color: isMyMessage ? Colors.light.background : theme.tint },
                ]}
              >
                {datePlanBusy ? 'Notifying Betweener...' : 'Get Betweener help'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        ) : null}
        {canRescheduleDatePlan && canCancelDatePlan ? (
          <TouchableOpacity
            style={[
              styles.datePlanTertiaryAction,
              { opacity: datePlanBusy ? 0.7 : 1 },
            ]}
            disabled={datePlanBusy}
            onPress={() => datePlanPlanId && onCancelDatePlan(datePlanPlanId)}
          >
            <Text
              style={[
                styles.datePlanTertiaryActionText,
                { color: isMyMessage ? withAlpha(Colors.light.background, 0.84) : '#d96b6b' },
              ]}
            >
              {datePlanBusy ? 'Cancelling...' : 'Cancel date'}
            </Text>
          </TouchableOpacity>
        ) : null}
        {item.dateInvite?.mapLink && !canRescheduleDatePlan ? (
          <View style={styles.datePlanFooterRow}>
            <View style={styles.datePlanFooterLead}>
              <MaterialCommunityIcons
                name="map-marker-path"
                size={13}
                color={isMyMessage ? withAlpha(Colors.light.background, 0.82) : theme.textMuted}
              />
              <Text style={[styles.datePlanFooterText, { color: isMyMessage ? withAlpha(Colors.light.background, 0.82) : theme.textMuted }]}>
                Open in Maps
              </Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={16}
              color={isMyMessage ? withAlpha(Colors.light.background, 0.72) : theme.textMuted}
            />
          </View>
        ) : null}
      </View>
    );
  }
);

DatePlanMessageContent.displayName = "DatePlanMessageContent";
