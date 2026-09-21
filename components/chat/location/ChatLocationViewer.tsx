import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import type { ChatScreenStyles } from '@/components/chat/styles/chat-screen.styles';
import type { MessageType } from '@/components/chat/types';
import { GOOGLE_MAPS_MAP_ID, MAP_STYLE_DARK, MAP_STYLE_LIGHT } from '@/constants/chat';
import { Colors } from '@/constants/theme';
import { buildMapsLink } from '@/lib/chat/location/chat-location-payload';
import { formatRemainingTime } from '@/lib/chat/ui/message-formatters';

type ChatLocationViewerProps = {
  message: MessageType | null;
  currentUserId?: string | null;
  now: number;
  isDark: boolean;
  theme: typeof Colors.light;
  styles: ChatScreenStyles;
  onClose: () => void;
  onStopSharing: (messageId: string) => void;
};

export function ChatLocationViewer({
  message,
  currentUserId,
  now,
  isDark,
  theme,
  styles,
  onClose,
  onStopSharing,
}: ChatLocationViewerProps) {
  const location = message?.location;
  return (
    <Modal visible={Boolean(location)} onRequestClose={onClose} animationType="slide">
      <View style={styles.locationViewerContainer}>
        {location ? (
          <>
            <MapView
              key={`${location.lat}-${location.lng}`}
              style={StyleSheet.absoluteFill}
              provider={Platform.OS === 'web' ? undefined : PROVIDER_GOOGLE}
              googleMapId={GOOGLE_MAPS_MAP_ID || undefined}
              mapPadding={{ top: 120, right: 20, bottom: 220, left: 20 }}
              customMapStyle={GOOGLE_MAPS_MAP_ID ? undefined : isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
              initialRegion={{
                latitude: location.lat,
                longitude: location.lng,
                latitudeDelta: 0.012,
                longitudeDelta: 0.012,
              }}
              showsPointsOfInterests
              showsBuildings
            >
              <Marker
                coordinate={{ latitude: location.lat, longitude: location.lng }}
                title={location.label}
                pinColor={theme.tint}
              />
            </MapView>
            <View style={styles.locationViewerHeader}>
              <TouchableOpacity style={styles.locationViewerClose} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
              <View style={styles.locationViewerText}>
                <Text style={styles.locationViewerTitle} numberOfLines={1}>{location.label}</Text>
                {location.address ? (
                  <Text style={styles.locationViewerSubtitle} numberOfLines={1}>{location.address}</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.locationViewerFooter}>
              {location.live ? (
                <View style={styles.locationViewerLiveRow}>
                  <View style={styles.locationLiveBadge}>
                    <Text style={styles.locationLiveBadgeText}>Live</Text>
                  </View>
                  <Text style={styles.locationLiveText}>{formatRemainingTime(location.expiresAt, now)}</Text>
                  {message.senderId === currentUserId
                    && location.expiresAt
                    && location.expiresAt.getTime() > now ? (
                    <TouchableOpacity
                      style={styles.locationStopButton}
                      onPress={() => onStopSharing(message.id)}
                    >
                      <Text style={styles.locationStopText}>Stop sharing</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.locationViewerAction}
                onPress={() => {
                  const link = location.mapLink || buildMapsLink(location.lat, location.lng);
                  void Linking.openURL(link);
                }}
              >
                <MaterialCommunityIcons name="directions" size={18} color={theme.text} />
                <Text style={styles.locationViewerActionText}>Open in Maps</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}
