import { memo, useEffect, useMemo, useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import type { MessageType } from "@/components/chat/types";
import type { ChatMessageStyles } from "@/components/chat/message-variants/shared";
import { withAlpha } from "@/components/chat/message-variants/shared";

type LocationMessageContentProps = {
  item: MessageType;
  isMyMessage: boolean;
  styles: ChatMessageStyles;
  theme: typeof Colors.light;
  onStopLiveShare: (messageId: string) => void;
  formatRemainingTime: (expiresAt: Date | null | undefined, now: number) => string;
};

const LocationMessageContent = memo(
  ({
    item,
    isMyMessage,
    styles,
    theme,
    onStopLiveShare,
    formatRemainingTime,
  }: LocationMessageContentProps) => {
    const [liveLocationNow, setLiveLocationNow] = useState(() => Date.now());

    useEffect(() => {
      if (item.type !== 'location' || !item.location?.live || !item.location?.expiresAt) return;
      setLiveLocationNow(Date.now());
      const interval = setInterval(() => {
        const nextNow = Date.now();
        setLiveLocationNow(nextNow);
        if (item.location?.expiresAt && item.location.expiresAt.getTime() <= nextNow) {
          clearInterval(interval);
        }
      }, 30000);
      return () => clearInterval(interval);
    }, [item.id, item.location?.expiresAt?.getTime(), item.location?.live, item.type]);

    const locationRemaining = useMemo(() => {
      if (item.type !== 'location' || !item.location?.live) return null;
      return formatRemainingTime(item.location.expiresAt, liveLocationNow);
    }, [formatRemainingTime, item.location?.expiresAt, item.location?.live, item.type, liveLocationNow]);

    const locationIsActive = useMemo(() => {
      if (item.type !== 'location' || !item.location?.live || !item.location?.expiresAt) return false;
      return item.location.expiresAt.getTime() > liveLocationNow;
    }, [item.location?.expiresAt, item.location?.live, item.type, liveLocationNow]);

    if (item.type !== 'location') return null;

    return (
      <View style={styles.locationMessageContainer}>
        <View style={styles.locationMapFrame}>
          {item.location?.mapUrl ? (
            <Image
              source={{ uri: item.location.mapUrl }}
              style={styles.locationMapImage}
            />
          ) : (
            <View style={styles.locationMapPlaceholder}>
              <MaterialCommunityIcons name="map-outline" size={28} color={theme.textMuted} />
              <Text style={[styles.locationPlaceholderText, { color: theme.textMuted }]}>
                Map preview
              </Text>
            </View>
          )}
        </View>
        <View
          style={[
            styles.locationDetailsCard,
            isMyMessage ? styles.locationDetailsCardMy : styles.locationDetailsCardTheir,
          ]}
        >
          <View style={styles.locationInfoRow}>
            <View style={[styles.locationIconBadge, { backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.15) : withAlpha(theme.tint, 0.14) }]}>
              <MaterialCommunityIcons
                name={item.location?.live ? "map-marker-radius-outline" : "map-marker-outline"}
                size={16}
                color={isMyMessage ? Colors.light.background : theme.tint}
              />
            </View>
            <View style={styles.locationTextBlock}>
              <Text
                style={[
                  styles.locationLabelText,
                  { color: isMyMessage ? Colors.light.background : theme.text },
                ]}
                numberOfLines={1}
              >
                {item.location?.label || 'Shared location'}
              </Text>
              {item.location?.address ? (
                <Text
                  style={[
                    styles.locationAddressText,
                    { color: isMyMessage ? withAlpha(Colors.light.background, 0.75) : theme.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {item.location.address}
                </Text>
              ) : null}
            </View>
          </View>
          <View
            style={[
              styles.locationRouteRow,
              isMyMessage ? styles.locationRoutePillMy : styles.locationRoutePillTheir,
            ]}
          >
            <MaterialCommunityIcons
              name="navigation-variant-outline"
              size={12}
              color={isMyMessage ? withAlpha(Colors.light.background, 0.8) : theme.textMuted}
            />
            <Text
              style={[
                styles.locationRouteText,
                { color: isMyMessage ? withAlpha(Colors.light.background, 0.8) : theme.textMuted },
              ]}
            >
              Tap for directions
            </Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={14}
              color={isMyMessage ? withAlpha(Colors.light.background, 0.8) : theme.textMuted}
            />
          </View>
          {item.location?.live ? (
            <View style={styles.locationLiveRow}>
              <View style={[styles.locationLiveBadge, { backgroundColor: isMyMessage ? withAlpha(Colors.light.background, 0.18) : withAlpha(theme.secondary, 0.18) }]}>
                <Text
                  style={[
                    styles.locationLiveBadgeText,
                    { color: isMyMessage ? Colors.light.background : theme.secondary },
                  ]}
                >
                  Live
                </Text>
              </View>
              <Text
                style={[
                  styles.locationLiveText,
                  { color: isMyMessage ? withAlpha(Colors.light.background, 0.8) : theme.textMuted },
                ]}
              >
                {locationRemaining || 'Live'}
              </Text>
              {isMyMessage && locationIsActive ? (
                <TouchableOpacity
                  testID="chat-location-stop-sharing"
                  style={[
                    styles.locationStopButton,
                    { borderColor: isMyMessage ? withAlpha(Colors.light.background, 0.45) : withAlpha(theme.text, 0.2) },
                  ]}
                  onPress={(event) => {
                    if (event?.stopPropagation) {
                      event.stopPropagation();
                    }
                    onStopLiveShare(item.id);
                  }}
                >
                  <Text
                    style={[
                      styles.locationStopText,
                      { color: isMyMessage ? Colors.light.background : theme.text },
                    ]}
                  >
                    Stop sharing
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    );
  },
);

LocationMessageContent.displayName = "LocationMessageContent";

export default LocationMessageContent;
