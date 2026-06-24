import { supabase } from '@/lib/supabase';
import {
  isAdministrativeLocationLabel,
  isBroadRegionLabel,
  isKnownGhanaRegionLabel,
} from '@/lib/location/location-display';
import { findCountryByCode, findCountryByLabel } from '@/lib/location/countries';

type Result =
  | { ok: true }
  | { ok: false; error: string; permissionDenied?: boolean };

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
      return { ok: false, error: 'Location permission was denied.', permissionDenied: true };
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
        city: null,
        region: null,
        location: null,
        current_country: null,
        current_country_code: null,
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

    const parts = label
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const primary = parts[0] || label;
    const secondary = parts[1] || null;
    const normalizedCountryCode = countryCode ? countryCode.trim().toUpperCase() : '';
    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('country_lock_policy')
      .eq('id', profileId)
      .single();
    if (profileError) {
      return { ok: false, error: profileError.message };
    }
    if (profileRow?.country_lock_policy === 'ghana_locked' && normalizedCountryCode && normalizedCountryCode !== 'GH') {
      return {
        ok: false,
        error: 'Current country is locked to Ghana until precise location confirms you are outside Ghana.',
      };
    }
    const resolvedCountry = normalizedCountryCode ? findCountryByCode(normalizedCountryCode)?.label ?? null : null;
    const normalizedPrimary = primary.toLowerCase();
    const normalizedResolvedCountry = resolvedCountry?.toLowerCase() ?? '';
    const primaryCountryAlias = findCountryByLabel(primary)?.code ?? null;
    const primaryLooksCountry =
      (!!resolvedCountry && normalizedPrimary === normalizedResolvedCountry) ||
      (!!normalizedCountryCode && primaryCountryAlias === normalizedCountryCode);
    const primaryLooksBroadRegion =
      isBroadRegionLabel(primary) || isAdministrativeLocationLabel(primary) || primaryLooksCountry;
    const isGhanaRegionOnly = normalizedCountryCode === 'GH' && isKnownGhanaRegionLabel(primary);
    const city = isGhanaRegionOnly || primaryLooksBroadRegion ? null : primary;
    const region =
      secondary ||
      (isGhanaRegionOnly || primaryLooksBroadRegion ? primary : primary);
    const updateData: Record<string, any> = {
      location: city || resolvedCountry || primary,
      city,
      region,
      location_precision: 'CITY',
      latitude: null,
      longitude: null,
      location_updated_at: new Date().toISOString(),
    };
    if (normalizedCountryCode) {
      updateData.current_country_code = normalizedCountryCode;
      if (resolvedCountry) {
        updateData.current_country = resolvedCountry;
      }
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
