import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { RefObject } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type MapPressEvent, type Region } from 'react-native-maps';

import type { ChatScreenStyles } from '@/components/chat/styles/chat-screen.styles';
import {
  GOOGLE_MAPS_MAP_ID,
  LIVE_LOCATION_PRESETS,
  MAP_STYLE_DARK,
  MAP_STYLE_LIGHT,
} from '@/constants/chat';
import { Colors } from '@/constants/theme';
import type { PlaceResult, PlaceSuggestion } from '@/lib/chat/location/chat-location-payload';

type ChatLocationPickerProps = {
  visible: boolean;
  mapRef: RefObject<MapView | null>;
  mapInitialRegion: Region;
  selectedPlace: PlaceResult | null;
  locationStatus: string | null;
  sheetAnimation: Animated.Value;
  searchQuery: string;
  searchLoading: boolean;
  suggestions: PlaceSuggestion[];
  nearbyPlaces: PlaceResult[];
  placesLoading: boolean;
  hasPlacesKey: boolean;
  liveDurationMinutes: number;
  locationError: string | null;
  showLoading: boolean;
  isDark: boolean;
  theme: typeof Colors.light;
  styles: ChatScreenStyles;
  onClose: () => void;
  onMapPress: (event: MapPressEvent) => void;
  onSearchQueryChange: (value: string) => void;
  onSuggestionPress: (suggestion: PlaceSuggestion) => void;
  onSelectPlace: (place: PlaceResult) => void;
  onLiveDurationChange: (minutes: number) => void;
  onSendPin: () => void;
  onSendLive: () => void;
};

export function ChatLocationPicker({
  visible,
  mapRef,
  mapInitialRegion,
  selectedPlace,
  locationStatus,
  sheetAnimation,
  searchQuery,
  searchLoading,
  suggestions,
  nearbyPlaces,
  placesLoading,
  hasPlacesKey,
  liveDurationMinutes,
  locationError,
  showLoading,
  isDark,
  theme,
  styles,
  onClose,
  onMapPress,
  onSearchQueryChange,
  onSuggestionPress,
  onSelectPlace,
  onLiveDurationChange,
  onSendPin,
  onSendLive,
}: ChatLocationPickerProps) {
  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="slide">
      <View style={styles.locationModalContainer}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={Platform.OS === 'web' ? undefined : PROVIDER_GOOGLE}
          googleMapId={GOOGLE_MAPS_MAP_ID || undefined}
          mapPadding={{ top: 160, right: 20, bottom: 320, left: 20 }}
          customMapStyle={GOOGLE_MAPS_MAP_ID ? undefined : isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
          initialRegion={mapInitialRegion}
          onPress={onMapPress}
          showsUserLocation={locationStatus === 'granted'}
          showsMyLocationButton={locationStatus === 'granted'}
          showsPointsOfInterests
          showsBuildings
        >
          {selectedPlace ? (
            <Marker
              coordinate={{ latitude: selectedPlace.lat, longitude: selectedPlace.lng }}
              title={selectedPlace.name}
              pinColor={theme.tint}
            />
          ) : null}
        </MapView>

        <Animated.View
          style={[
            styles.locationTopBar,
            {
              opacity: sheetAnimation,
              transform: [{
                translateY: sheetAnimation.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }),
              }],
            },
          ]}
        >
          <BlurView intensity={45} tint={isDark ? 'dark' : 'light'} style={styles.locationGlass} pointerEvents="none" />
          <View style={styles.locationTopContent}>
            <TouchableOpacity style={styles.locationTopButton} onPress={onClose}>
              <MaterialCommunityIcons name="chevron-left" size={22} color={theme.text} />
            </TouchableOpacity>
            <View>
              <Text style={styles.locationTopTitle}>Share location</Text>
              <Text style={styles.locationTopSubtitle}>Pick a place to send</Text>
            </View>
            <View style={styles.locationTopSpacer} />
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.locationSearchWrap,
            {
              opacity: sheetAnimation,
              transform: [{
                translateY: sheetAnimation.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }),
              }],
            },
          ]}
        >
          <BlurView intensity={45} tint={isDark ? 'dark' : 'light'} style={styles.locationGlass} pointerEvents="none" />
          <View style={styles.locationSearchContent}>
            <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
            <TextInput
              style={styles.locationSearchInput}
              placeholder="Search places"
              placeholderTextColor={theme.textMuted}
              value={searchQuery}
              onChangeText={onSearchQueryChange}
            />
            {searchLoading ? (
              <ActivityIndicator size="small" color={theme.textMuted} />
            ) : searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => onSearchQueryChange('')}>
                <MaterialCommunityIcons name="close-circle" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>

        {suggestions.length > 0 ? (
          <View style={styles.locationSuggestionsPanel}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {suggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion.id}
                  style={styles.locationSuggestionRow}
                  onPress={() => onSuggestionPress(suggestion)}
                >
                  <MaterialCommunityIcons name="map-marker-outline" size={16} color={theme.textMuted} />
                  <View style={styles.locationSuggestionText}>
                    <Text style={styles.locationSuggestionTitle}>{suggestion.primary}</Text>
                    {suggestion.secondary ? (
                      <Text style={styles.locationSuggestionSubtitle}>{suggestion.secondary}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <Animated.View
          style={[
            styles.locationBottomSheet,
            {
              opacity: sheetAnimation,
              transform: [{
                translateY: sheetAnimation.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }),
              }],
            },
          ]}
        >
          <BlurView intensity={55} tint={isDark ? 'dark' : 'light'} style={styles.locationGlass} pointerEvents="none" />
          <View style={styles.locationSheetContent}>
            <View style={styles.locationSheetHandle} />
            <View style={styles.locationSelectedRow}>
              <Text style={styles.locationSectionTitle}>Selected</Text>
              <Text style={styles.locationSelectedValue} numberOfLines={1}>
                {selectedPlace?.name || 'Tap the map or search'}
              </Text>
              {selectedPlace?.address ? (
                <Text style={styles.locationSelectedSubtitle} numberOfLines={1}>{selectedPlace.address}</Text>
              ) : null}
            </View>

            <View style={styles.locationNearbyRow}>
              <View style={styles.locationNearbyHeader}>
                <Text style={styles.locationSectionTitle}>Nearby</Text>
                {placesLoading ? <ActivityIndicator size="small" color={theme.textMuted} /> : null}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {nearbyPlaces.map((place) => (
                  <TouchableOpacity
                    key={place.id}
                    style={styles.locationNearbyCard}
                    onPress={() => onSelectPlace(place)}
                  >
                    <View style={styles.locationNearbyIcon}>
                      <MaterialCommunityIcons name="map-marker-outline" size={16} color={theme.tint} />
                    </View>
                    <View style={styles.locationNearbyMeta}>
                      <Text style={styles.locationNearbyName} numberOfLines={1}>{place.name}</Text>
                      {place.address ? (
                        <Text style={styles.locationNearbyAddress} numberOfLines={1}>{place.address}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
                {!hasPlacesKey ? (
                  <View style={styles.locationNearbyCard}>
                    <View style={styles.locationNearbyIcon}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={16} color={theme.textMuted} />
                    </View>
                    <View style={styles.locationNearbyMeta}>
                      <Text style={styles.locationNearbyName}>Add Google Maps key</Text>
                      <Text style={styles.locationNearbyAddress}>Places search disabled</Text>
                    </View>
                  </View>
                ) : null}
              </ScrollView>
            </View>

            <View style={styles.locationLiveSection}>
              <Text style={styles.locationSectionTitle}>Live location</Text>
              <View style={styles.locationPresetRow}>
                {LIVE_LOCATION_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    style={[
                      styles.locationPresetChip,
                      liveDurationMinutes === preset && styles.locationPresetChipActive,
                    ]}
                    onPress={() => onLiveDurationChange(preset)}
                  >
                    <Text style={[
                      styles.locationPresetText,
                      liveDurationMinutes === preset && styles.locationPresetTextActive,
                    ]}>
                      {preset === 60 ? '1 hour' : preset === 480 ? '8 hours' : `${preset} min`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.locationLiveHint}>
                Remaining time is always visible and you can stop sharing anytime.
              </Text>
            </View>

            {locationError ? <Text style={styles.locationErrorText}>{locationError}</Text> : null}
            <View style={styles.locationActionRow}>
              <TouchableOpacity style={styles.locationGhostButton} onPress={onSendPin}>
                <MaterialCommunityIcons name="map-marker-outline" size={18} color={theme.text} />
                <Text style={styles.locationGhostText}>Send pin</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.locationPrimaryButton} onPress={onSendLive}>
                <MaterialCommunityIcons name="map-marker-radius-outline" size={18} color={Colors.light.background} />
                <Text style={styles.locationPrimaryText}>Share live</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {showLoading ? (
          <View style={styles.locationLoadingOverlay}>
            <ActivityIndicator size="large" color={theme.tint} />
            <Text style={styles.locationLoadingText}>Finding your location...</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
