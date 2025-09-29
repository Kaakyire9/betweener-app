import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface PhotoGalleryProps {
  photos: string[];
  canEdit?: boolean;
  onAddPhoto?: () => void;
  onRemovePhoto?: (index: number) => void;
}

export default function PhotoGallery({ 
  photos, 
  canEdit = false, 
  onAddPhoto,
  onRemovePhoto 
}: PhotoGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

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
    } else if (direction === 'next' && selectedIndex < photos.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  // Calculate grid layout
  const itemWidth = (screenWidth - 60) / 3; // 3 columns with spacing
  const itemHeight = itemWidth * 1.25; // 4:5 aspect ratio

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {photos.map((photo, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.photoContainer, { width: itemWidth, height: itemHeight }]}
            onPress={() => handlePhotoPress(index)}
          >
            <Image
              source={{ uri: photo }}
              style={styles.photo}
              resizeMode="cover"
            />
            {canEdit && (
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemovePhoto(index)}
              >
                <MaterialCommunityIcons name="close" size={12} color="#fff" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ))}
        
        {/* Add Photo Button */}
        {canEdit && photos.length < 6 && (
          <TouchableOpacity
            style={[styles.addPhotoContainer, { width: itemWidth, height: itemHeight }]}
            onPress={onAddPhoto}
          >
            <MaterialCommunityIcons name="camera-plus" size={32} color="#9ca3af" />
            <Text style={styles.addPhotoText}>Add Photo</Text>
          </TouchableOpacity>
        )}
        
        {/* Empty slots for visual balance */}
        {Array.from({ length: Math.max(0, 6 - photos.length - (canEdit ? 1 : 0)) }).map((_, index) => (
          <View
            key={`empty-${index}`}
            style={[styles.emptySlot, { width: itemWidth, height: itemHeight }]}
          />
        ))}
      </View>

      {/* Full Screen Photo Modal */}
      <Modal
        visible={selectedIndex !== null}
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
      >
        <View style={styles.modalContainer}>
          <SafeAreaView style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedIndex(null)}
              >
                <MaterialCommunityIcons name="close" size={24} color="#fff" />
              </TouchableOpacity>
              
              <Text style={styles.photoCounter}>
                {selectedIndex !== null ? selectedIndex + 1 : 0} of {photos.length}
              </Text>

              {canEdit && selectedIndex !== null && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleRemovePhoto(selectedIndex)}
                >
                  <MaterialCommunityIcons name="delete" size={24} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            {/* Photo */}
            <View style={styles.photoWrapper}>
              {selectedIndex !== null && (
                <Image
                  source={{ uri: photos[selectedIndex] }}
                  style={styles.fullScreenPhoto}
                  resizeMode="contain"
                />
              )}
              
              {/* Navigation Buttons */}
              {photos.length > 1 && (
                <>
                  {selectedIndex !== null && selectedIndex > 0 && (
                    <TouchableOpacity
                      style={[styles.navButton, styles.prevButton]}
                      onPress={() => navigatePhoto('prev')}
                    >
                      <MaterialCommunityIcons name="chevron-left" size={32} color="#fff" />
                    </TouchableOpacity>
                  )}
                  
                  {selectedIndex !== null && selectedIndex < photos.length - 1 && (
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
            {photos.length > 1 && (
              <ScrollView
                horizontal
                style={styles.thumbnailStrip}
                contentContainerStyle={styles.thumbnailContent}
                showsHorizontalScrollIndicator={false}
              >
                {photos.map((photo, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.thumbnail,
                      selectedIndex === index && styles.activeThumbnail
                    ]}
                    onPress={() => setSelectedIndex(index)}
                  >
                    <Image
                      source={{ uri: photo }}
                      style={styles.thumbnailImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
  },
  photoContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPhotoContainer: {
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPhotoText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
    fontWeight: '500',
  },
  emptySlot: {
    // Just for spacing
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
    width: screenWidth,
    height: screenHeight * 0.7,
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