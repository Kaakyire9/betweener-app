import { useLocationTracking } from '@/hooks/use-location-tracking';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

export function LocationSettings() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [updateInterval, setUpdateInterval] = useState(30); // minutes
  
  const {
    currentLocation,
    isTracking,
    lastUpdate,
    error,
    startTracking,
    stopTracking,
    manualUpdate
  } = useLocationTracking({
    enableBackgroundTracking: isEnabled,
    updateInterval: updateInterval
  });

  const handleToggleTracking = async () => {
    if (isEnabled) {
      stopTracking();
      setIsEnabled(false);
    } else {
      try {
        await startTracking();
        setIsEnabled(true);
      } catch (error) {
        Alert.alert(
          'Location Permission Required',
          'Please enable location services to use automatic location tracking.',
          [{ text: 'OK' }]
        );
      }
    }
  };

  const handleManualUpdate = async () => {
    try {
      await manualUpdate();
      Alert.alert('Success', 'Your location has been updated!');
    } catch (error) {
      Alert.alert('Error', 'Failed to update location. Please try again.');
    }
  };

  const formatLocationDisplay = () => {
    if (!currentLocation) return 'Location not available';
    
    const { city, region, latitude, longitude } = currentLocation;
    
    if (city && region) {
      return `${city}, ${region}`;
    } else if (latitude && longitude) {
      return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }
    
    return 'Location detected';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Location Settings</Text>
      
      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>Auto Location Tracking</Text>
        <Switch
          value={isEnabled}
          onValueChange={handleToggleTracking}
          trackColor={{ false: '#767577', true: '#81b0ff' }}
          thumbColor={isEnabled ? '#f5dd4b' : '#f4f3f4'}
        />
      </View>

      <Text style={styles.description}>
        When enabled, your location will be automatically updated when you travel to help find nearby users.
      </Text>

      <View style={styles.statusContainer}>
        <Text style={styles.statusLabel}>Current Location:</Text>
        <Text style={styles.statusValue}>{formatLocationDisplay()}</Text>
        
        {lastUpdate && (
          <>
            <Text style={styles.statusLabel}>Last Updated:</Text>
            <Text style={styles.statusValue}>{lastUpdate.toLocaleTimeString()}</Text>
          </>
        )}
        
        {error && (
          <>
            <Text style={styles.errorLabel}>Error:</Text>
            <Text style={styles.errorValue}>{error}</Text>
          </>
        )}
      </View>

      <TouchableOpacity style={styles.updateButton} onPress={handleManualUpdate}>
        <Text style={styles.updateButtonText}>Update Location Now</Text>
      </TouchableOpacity>

      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>How it works:</Text>
        <Text style={styles.infoText}>
          • Your profile region (e.g., "Greater Accra") stays the same{'\n'}
          • Real-time GPS coordinates are updated automatically{'\n'}
          • Your current location is tracked for matching purposes{'\n'}
          • Works when traveling from Accra to Takoradi for business
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f9f9f9',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 10,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  statusContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 5,
  },
  statusValue: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  errorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d32f2f',
    marginTop: 5,
  },
  errorValue: {
    fontSize: 14,
    color: '#d32f2f',
    marginBottom: 5,
  },
  updateButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoContainer: {
    backgroundColor: '#e3f2fd',
    padding: 15,
    borderRadius: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976d2',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#1976d2',
    lineHeight: 20,
  },
});