import { supabase } from '@/lib/supabase';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Request foreground location permission, fetch current coords, and persist
 * them on the profile with precise accuracy metadata. Uses a dynamic import
 * of expo-location so the app won't crash if the native module isn't present.
 */
export async function requestAndSavePreciseLocation(profileId: string): Promise<Result> {
  let Location: any;
  try {
    Location = require('expo-location');
  } catch (_e) {
    return { ok: false, error: 'expo-location is not installed. Add it to your project to enable GPS.' };
  }

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { ok: false, error: 'Location permission was denied.' };
    }

    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      maximumAge: 30_000,
      mayShowUserSettingsDialog: true,
    });

    const { latitude, longitude } = coords || {};
    if (latitude == null || longitude == null) {
      return { ok: false, error: 'Unable to read device coordinates.' };
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        latitude,
        longitude,
        location_precision: 'EXACT',
        location_updated_at: new Date().toISOString(),
      })
      .eq('id', profileId);

    if (error) {
      return { ok: false, error: error.message };
    }

    const { error: geocodeError } = await supabase.functions.invoke('reverse-geocode', {
      body: { latitude, longitude },
    });
    if (geocodeError) {
      console.log('[location] reverse-geocode failed', geocodeError);
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to save location.' };
  }
}

/**
 * Save a coarse, manual location (city/region) and mark precision as city-level.
 * Clears stored coordinates to avoid implying exact position.
 */
export async function saveManualCityLocation(
  profileId: string,
  locationLabel: string,
  countryCode?: string
): Promise<Result> {
  try {
    const label = locationLabel.trim();
    if (!label) return { ok: false, error: 'Please enter a city or region.' };

    const city = label.split(',')[0]?.trim() || label;
    const normalizedCountryCode = countryCode ? countryCode.trim().toUpperCase() : '';
    const updateData: Record<string, any> = {
      location: city,
      city,
      region: city,
      location_precision: 'CITY',
      latitude: null,
      longitude: null,
      location_updated_at: new Date().toISOString(),
    };
    if (normalizedCountryCode) {
      updateData.current_country_code = normalizedCountryCode;
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', profileId);

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to save manual location.' };
  }
}
