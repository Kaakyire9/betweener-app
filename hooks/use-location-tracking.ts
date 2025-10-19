import { useState, useEffect } from 'react';
import { LocationService, LocationData } from '@/lib/location-service';
import { useAuth } from '@/lib/auth-context';

interface LocationTrackingOptions {
  enableBackgroundTracking?: boolean;
  updateInterval?: number; // minutes
  accuracy?: 'high' | 'balanced' | 'low';
}

export function useLocationTracking(options: LocationTrackingOptions = {}) {
  const { user } = useAuth();
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    enableBackgroundTracking = false,
    updateInterval = 30, // 30 minutes default
    accuracy = 'balanced'
  } = options;

  const updateLocation = async () => {
    if (!user) return;

    try {
      console.log('🗺️ useLocationTracking: Getting current location...');
      setError(null);
      
      const location = await LocationService.getCurrentLocation();
      
      if (location) {
        setCurrentLocation(location);
        setLastUpdate(new Date());
        
        // Update database
        const success = await LocationService.updateUserLocation(user.id, location);
        
        if (success) {
          console.log('🗺️ useLocationTracking: Location updated successfully');
        } else {
          console.warn('🗺️ useLocationTracking: Failed to update location in database');
        }
      } else {
        setError('Unable to get current location');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown location error';
      setError(errorMessage);
      console.error('🗺️ useLocationTracking: Error updating location:', err);
    }
  };

  const startTracking = async () => {
    console.log('🗺️ useLocationTracking: Starting location tracking...');
    setIsTracking(true);
    
    // Get initial location
    await updateLocation();
    
    // Set up periodic updates
    const interval = setInterval(updateLocation, updateInterval * 60 * 1000);
    
    return () => {
      clearInterval(interval);
      setIsTracking(false);
    };
  };

  const stopTracking = () => {
    console.log('🗺️ useLocationTracking: Stopping location tracking...');
    setIsTracking(false);
  };

  const manualUpdate = async () => {
    console.log('🗺️ useLocationTracking: Manual location update triggered...');
    await updateLocation();
  };

  useEffect(() => {
    // Auto-start tracking if user is logged in and feature is enabled
    if (user && enableBackgroundTracking) {
      const cleanup = startTracking();
      
      return () => {
        cleanup.then(cleanupFn => cleanupFn?.());
      };
    }
  }, [user, enableBackgroundTracking]);

  return {
    currentLocation,
    isTracking,
    lastUpdate,
    error,
    startTracking,
    stopTracking,
    manualUpdate,
    updateLocation
  };
}