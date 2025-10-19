// import * as Location from 'expo-location';
import { supabase } from './supabase';
import { createClient } from '@supabase/supabase-js';

export interface LocationData {
  latitude: number;
  longitude: number;
  city?: string;
  region?: string;
  country?: string;
  accuracy?: number;
}

export class LocationService {
  
  /**
   * Request location permissions and get current location
   * Currently disabled due to expo-location native module issues
   */
  static async getCurrentLocation(): Promise<LocationData | null> {
    try {
      console.log('📍 LocationService: Location service temporarily disabled');
      return null;
      
      /* Temporarily disabled until expo-location native module is available
      console.log('📍 LocationService: Requesting location permissions...');
      
      // Request permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('📍 LocationService: Location permission not granted');
        throw new Error('Location permission not granted');
      }

      console.log('📍 LocationService: Getting current position...');
      
      // Get current position
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
      });

      console.log('📍 LocationService: Position obtained:', location.coords.latitude, location.coords.longitude);

      // Reverse geocode to get city/region info
      try {
        const geocode = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });

        const place = geocode[0];
        
        return {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          city: place?.city || place?.district,
          region: place?.region || place?.subregion,
          country: place?.country,
          accuracy: location.coords.accuracy || undefined,
        };
      } catch (geocodeError) {
        console.warn('📍 LocationService: Geocoding failed, returning coordinates only:', geocodeError);
        
        // Return just coordinates if geocoding fails
        return {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy || undefined,
        };
      }
      */
    } catch (error) {
      console.error('📍 LocationService: Error getting current location:', error);
      return null;
    }
  }

  /**
   * Update user's location in database
   */
  static async updateUserLocation(userId: string, locationData: LocationData): Promise<boolean> {
    try {
      console.log('📍 LocationService: Updating user location in database...', locationData);
      
      // Use service role client for reliable updates (bypasses RLS)
      const serviceRoleClient = createClient(
        process.env.EXPO_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { error } = await serviceRoleClient
        .from('profiles')
        .update({
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          city: locationData.city,
          location_updated_at: new Date().toISOString(),
          location_precision: locationData.accuracy && locationData.accuracy < 100 ? 'EXACT' : 'APPROXIMATE'
        })
        .eq('user_id', userId);

      if (error) {
        console.error('📍 LocationService: Database update failed:', error);
        throw error;
      }
      
      console.log('📍 LocationService: Location updated successfully in database');
      return true;
    } catch (error) {
      console.error('Error updating user location:', error);
      return false;
    }
  }

  /**
   * Get approximate location from city/region for fallback
   */
  static async getLocationFromAddress(city: string, region: string, country: string): Promise<LocationData | null> {
    try {
      const query = `${city}, ${region}, ${country}`;
      const geocodeResult = await Location.geocodeAsync(query);
      
      if (geocodeResult.length > 0) {
        const result = geocodeResult[0];
        return {
          latitude: result.latitude,
          longitude: result.longitude,
          city,
          region,
          country,
          accuracy: 1000, // Approximate
        };
      }
      return null;
    } catch (error) {
      console.error('Error geocoding address:', error);
      return null;
    }
  }

  /**
   * Get major Ghana cities coordinates for fallback (supports both cities and regions)
   */
  static getGhanaCityCoordinates(cityOrRegion: string): LocationData | null {
    // Map both cities and regions to coordinates
    const locations: { [key: string]: LocationData } = {
      // Cities
      'accra': { latitude: 5.6037, longitude: -0.1870, city: 'Accra', region: 'Greater Accra', country: 'Ghana' },
      'kumasi': { latitude: 6.6885, longitude: -1.6244, city: 'Kumasi', region: 'Ashanti', country: 'Ghana' },
      'tamale': { latitude: 9.4034, longitude: -0.8424, city: 'Tamale', region: 'Northern', country: 'Ghana' },
      'cape coast': { latitude: 5.1053, longitude: -1.2466, city: 'Cape Coast', region: 'Central', country: 'Ghana' },
      'sekondi-takoradi': { latitude: 4.9344, longitude: -1.7639, city: 'Sekondi-Takoradi', region: 'Western', country: 'Ghana' },
      'ho': { latitude: 6.6111, longitude: 0.4708, city: 'Ho', region: 'Volta', country: 'Ghana' },
      'koforidua': { latitude: 6.0898, longitude: -0.2590, city: 'Koforidua', region: 'Eastern', country: 'Ghana' },
      'sunyani': { latitude: 7.3398, longitude: -2.3263, city: 'Sunyani', region: 'Brong-Ahafo', country: 'Ghana' },
      'wa': { latitude: 10.0601, longitude: -2.5057, city: 'Wa', region: 'Upper West', country: 'Ghana' },
      'bolgatanga': { latitude: 10.7854, longitude: -0.8571, city: 'Bolgatanga', region: 'Upper East', country: 'Ghana' },
      
      // Regions (mapped to their capital cities)
      'greater accra': { latitude: 5.6037, longitude: -0.1870, city: 'Accra', region: 'Greater Accra', country: 'Ghana' },
      'ashanti': { latitude: 6.6885, longitude: -1.6244, city: 'Kumasi', region: 'Ashanti', country: 'Ghana' },
      'northern': { latitude: 9.4034, longitude: -0.8424, city: 'Tamale', region: 'Northern', country: 'Ghana' },
      'central': { latitude: 5.1053, longitude: -1.2466, city: 'Cape Coast', region: 'Central', country: 'Ghana' },
      'western': { latitude: 4.9344, longitude: -1.7639, city: 'Sekondi-Takoradi', region: 'Western', country: 'Ghana' },
      'volta': { latitude: 6.6111, longitude: 0.4708, city: 'Ho', region: 'Volta', country: 'Ghana' },
      'eastern': { latitude: 6.0898, longitude: -0.2590, city: 'Koforidua', region: 'Eastern', country: 'Ghana' },
      'brong-ahafo': { latitude: 7.3398, longitude: -2.3263, city: 'Sunyani', region: 'Brong-Ahafo', country: 'Ghana' },
      'upper west': { latitude: 10.0601, longitude: -2.5057, city: 'Wa', region: 'Upper West', country: 'Ghana' },
      'upper east': { latitude: 10.7854, longitude: -0.8571, city: 'Bolgatanga', region: 'Upper East', country: 'Ghana' },
    };
    
    return locations[cityOrRegion.toLowerCase()] || null;
  }
}