import { Colors } from '@/constants/theme';
import OfflineImage from '@/components/media/OfflineImage';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getSafeRemoteImageUri } from '@/lib/profile/display-name';
import { useResponsiveMetrics } from '@/lib/responsive';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface PhotoGalleryProps {
  photos: string[];
  introVideoUrl?: string | null;
  introVideoThumbnail?: string | null;
  onOpenVideo?: () => void;
  canEdit?: boolean;
  onAddPhoto?: () => void;
  onRemovePhoto?: (index: number) => void;
  onMovePhoto?: (fromIndex: number, toIndex: number) => void;
  reorderEnabled?: boolean;
}

export default function PhotoGallery({ 
  photos, 
  introVideoUrl,
  introVideoThumbnail,
  onOpenVideo,
  canEdit = false, 
  onAddPhoto,
  onRemovePhoto,
  onMovePhoto,
  reorderEnabled = false,
}: PhotoGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const responsive = useResponsiveMetrics();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const insets = responsive.insets;
  const safePhotoItems = photos
    .map((photo, originalIndex) => ({ uri: getSafeRemoteImageUri(photo), originalIndex }))
    .filter((item): item is { uri: string; originalIndex: number } => Boolean(item.uri));
  const safePhotos = safePhotoItems.map((item) => item.uri);
  const safeIntroVideoUrl = introVideoUrl ? getSafeRemoteImageUri(introVideoUrl) : null;
  const hasIntroVideoMedia = Boolean(safeIntroVideoUrl);
  const safeIntroVideoThumbnail = hasIntroVideoMedia
    ? (getSafeRemoteImageUri(introVideoThumbnail) || safePhotos[0] || null)
    : null;

  const handlePhotoPress = (index: number) => {
    setSelectedIndex(index);
  };

  const handleRemovePhoto = (index: number) => {
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            onRemovePhoto?.(index);
            setSelectedIndex(null);
          }
        }
      ]
    );
  };

  const navigatePhoto = (direction: 'prev' | 'next') => {
    if (selectedIndex === null) return;
    
    if (direction === 'prev' && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    } else if (direction === 'next' && selectedIndex < safePhotos.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  // Measure the card itself: the parent already owns its horizontal padding.
  // Using the window width here caused a third tile to wrap, leaving a false
  // empty column on the right on Android and narrower devices.
  const gridGap = responsive.compactWidth ? 7 : 8;
  const availableGridWidth = gridWidth || responsive.contentWidth;
  const columnCount = availableGridWidth >= 320 ? 3 : 2;
  const itemWidth = Math.max(
    86,
    Math.floor((availableGridWidth - gridGap * (columnCount - 1)) / columnCount),
  );
  const itemHeight = Math.round(itemWidth * 1.24);
  const framedTileStyle = {
    backgroundColor: theme.background,
    borderColor: colorScheme === 'dark' ? 'rgba(91,193,187,0.30)' : 'rgba(0,128,128,0.20)',
  } as const;

  return (
    <View style={styles.container}>
      <View
        style={[styles.grid, { gap: gridGap }]}
        onLayout={({ nativeEvent }) => {
          const nextWidth = Math.floor(nativeEvent.layout.width);
          if (nextWidth > 0 && nextWidth !== gridWidth) setGridWidth(nextWidth);
        }}
      >
        {hasIntroVideoMedia && safeIntroVideoThumbnail ? (
          <TouchableOpacity
            style={[styles.photoContainer, framedTileStyle, { width: itemWidth, height: itemHeight }]}
            onPress={onOpenVideo}
            activeOpacity={0.85}
          >
            <OfflineImage
              uri={safeIntroVideoThumbnail}
              style={styles.photo}
              cachePolicy="memory-disk"
            />
            <View style={styles.videoOverlay} />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0.08)', 'transparent', 'rgba(3,13,16,0.34)']}
              locations={[0, 0.55, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.sceneBadge}>
              <Text style={styles.sceneBadgeText}>INTRO</Text>
            </View>
            <View style={styles.videoBadge}>
              <MaterialCommunityIcons name="play" size={18} color="#fff" />
            </View>
          </TouchableOpacity>
        ) : null}
        {safePhotoItems.map((photoItem, index) => (
          <TouchableOpacity
            key={`${photoItem.uri}-${photoItem.originalIndex}`}
            style={[styles.photoContainer, framedTileStyle, { width: itemWidth, height: itemHeight }]}
            onPress={() => handlePhotoPress(index)}
            activeOpacity={0.88}
          >
            <OfflineImage
              uri={photoItem.uri}
              style={styles.photo}
              cachePolicy="memory-disk"
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0.07)', 'transparent', 'rgba(3,13,16,0.32)']}
              locations={[0, 0.58, 1]}
              style={StyleSheet.absoluteFill}
            />
            {!reorderEnabled ? (
              <View style={styles.sceneBadge}>
                <Text style={styles.sceneBadgeText}>{String(index + 1).padStart(2, '0')}</Text>
              </View>
            ) : null}
            {canEdit && (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemovePhoto(photoItem.originalIndex)}
              >
                <MaterialCommunityIcons name="close" size={12} color="#fff" />
              </TouchableOpacity>
            )}
            {canEdit && reorderEnabled && onMovePhoto && safePhotoItems.length > 1 ? (
              <View style={styles.reorderControls}>
                <TouchableOpacity
                  style={[styles.reorderButton, index === 0 && styles.reorderButtonDisabled]}
                  disabled={index === 0}
                  onPress={() => onMovePhoto(photoItem.originalIndex, safePhotoItems[index - 1].originalIndex)}
                  accessibilityLabel={`Move photo ${index + 1} left`}
                >
                  <MaterialCommunityIcons name="chevron-left" size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reorderButton, index === safePhotoItems.length - 1 && styles.reorderButtonDisabled]}
                  disabled={index === safePhotoItems.length - 1}
                  onPress={() => onMovePhoto(photoItem.originalIndex, safePhotoItems[index + 1].originalIndex)}
                  accessibilityLabel={`Move photo ${index + 1} right`}
                >
                  <MaterialCommunityIcons name="chevron-right" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
        
        {/* Add Photo Button */}
        {canEdit && photos.length < 6 && (
          <TouchableOpacity
            style={[
              styles.addPhotoContainer,
              {
                width: itemWidth,
                height: itemHeight,
                backgroundColor: theme.background,
                borderColor: theme.outline,
              },
            ]}
            onPress={onAddPhoto}
            activeOpacity={0.82}
          >
            <View style={[styles.addPhotoIcon, { backgroundColor: `${theme.tint}18` }]}>
              <MaterialCommunityIcons name="image-plus" size={22} color={theme.tint} />
            </View>
            <Text style={[styles.addPhotoText, { color: theme.text }]}>Add scene</Text>
            <Text style={[styles.addPhotoHint, { color: theme.textMuted }]}>Up to six</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Full Screen Photo Modal */}
      <Modal
        visible={selectedIndex !== null}
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => setSelectedIndex(null)}
      >
        <View style={styles.modalContainer}>
          {/* SafeAreaView inside Modal can be inconsistent across devices; use explicit insets. */}
          <View style={[styles.modalContent, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedIndex(null)}
                hitSlop={{ top: 16, right: 16, bottom: 16, left: 16 }}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="close" size={24} color="#fff" />
              </TouchableOpacity>
              
              <Text style={styles.photoCounter}>
                {selectedIndex !== null ? selectedIndex + 1 : 0} of {safePhotos.length}
              </Text>

              {canEdit && selectedIndex !== null && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleRemovePhoto(safePhotoItems[selectedIndex]?.originalIndex ?? selectedIndex)}
                  hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name="delete" size={24} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            {/* Photo */}
            <View style={styles.photoWrapper}>
              {selectedIndex !== null && safePhotos[selectedIndex] ? (
                <OfflineImage
                  uri={safePhotos[selectedIndex]}
                  style={[
                    styles.fullScreenPhoto,
                    {
                      width: responsive.width,
                      height: Math.min(responsive.usableHeight * 0.72, responsive.height - insets.top - insets.bottom - 150),
                    },
                  ]}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              ) : null}
              
              {/* Navigation Buttons */}
              {safePhotos.length > 1 && (
                <>
                  {selectedIndex !== null && selectedIndex > 0 && (
                    <TouchableOpacity
                      style={[styles.navButton, styles.prevButton]}
                      onPress={() => navigatePhoto('prev')}
                    >
                      <MaterialCommunityIcons name="chevron-left" size={32} color="#fff" />
                    </TouchableOpacity>
                  )}
                  
                  {selectedIndex !== null && selectedIndex < safePhotos.length - 1 && (
                    <TouchableOpacity
                      style={[styles.navButton, styles.nextButton]}
                      onPress={() => navigatePhoto('next')}
                    >
                      <MaterialCommunityIcons name="chevron-right" size={32} color="#fff" />
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            {/* Thumbnail Strip */}
            {safePhotos.length > 1 && (
              <ScrollView
                horizontal
                style={styles.thumbnailStrip}
                contentContainerStyle={styles.thumbnailContent}
                showsHorizontalScrollIndicator={false}
              >
                {safePhotos.map((photo, index) => (
                  <TouchableOpacity
                    key={`${photo}-${safePhotoItems[index]?.originalIndex ?? index}`}
                    style={[
                      styles.thumbnail,
                      selectedIndex === index && styles.activeThumbnail
                    ]}
                    onPress={() => setSelectedIndex(index)}
                  >
                    <OfflineImage
                      uri={photo}
                      style={styles.thumbnailImage}
                      cachePolicy="memory-disk"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'stretch',
  },
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  photoContainer: {
    borderRadius: 15,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#001716',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(5, 18, 20, 0.76)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  sceneBadge: {
    position: 'absolute',
    left: 7,
    bottom: 7,
    minWidth: 28,
    height: 21,
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(5,18,20,0.68)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sceneBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    letterSpacing: 0.8,
    fontFamily: 'Manrope_700Bold',
  },
  reorderControls: {
    position: 'absolute',
    left: 7,
    bottom: 7,
    flexDirection: 'row',
    gap: 5,
  },
  reorderButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7,20,26,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  reorderButtonDisabled: {
    opacity: 0.34,
  },
  addPhotoContainer: {
    borderRadius: 15,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 1,
  },
  addPhotoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  addPhotoText: {
    fontSize: 12.5,
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  addPhotoHint: {
    marginTop: 2,
    fontSize: 9.5,
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  videoBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  modalContent: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoCounter: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  deleteButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoWrapper: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenPhoto: {
  },
  navButton: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    top: '45%',
  },
  prevButton: {
    left: 20,
  },
  nextButton: {
    right: 20,
  },
  thumbnailStrip: {
    maxHeight: 80,
    paddingVertical: 10,
  },
  thumbnailContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activeThumbnail: {
    borderColor: Colors.light.tint,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
});
