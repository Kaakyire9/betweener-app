import { supabase } from '@/lib/supabase';
import { findCountryByCode } from '@/lib/location/countries';
import { isGhanaCountryManagedPolicy } from '@/lib/location/country-lock';
import { isLegacyGhanaLocalityForeignKeyError } from '@/lib/location/locality-errors';
import { buildProfileLocationUpdate } from '@/lib/profile/profile-location-update';

type Result =
  | {
      ok: true;
      verification?: {
        status?: string;
        message?: string;
        next_eligible_at?: string;
        country_code?: string;
        country_name?: string;
      };
    }
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
    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('country_lock_policy, current_country_code')
      .eq('id', profileId)
      .single();
    if (profileError) {
      return { ok: false, error: profileError.message };
    }
    const requiresManagedCountryVerification = isGhanaCountryManagedPolicy(
      profileRow?.country_lock_policy,
    );

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { ok: false, error: 'Location permission was denied.', permissionDenied: true };
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: requiresManagedCountryVerification
        ? Location.Accuracy.Highest
        : Location.Accuracy.High,
      maximumAge: requiresManagedCountryVerification ? 0 : 30_000,
      mayShowUserSettingsDialog: true,
    });

    const { coords } = location || {};
    const { latitude, longitude, accuracy } = coords || {};
    if (latitude == null || longitude == null) {
      return { ok: false, error: 'Unable to read device coordinates.' };
    }

    const mocked = location?.mocked === true || coords?.mocked === true;
    if (mocked) {
      return {
        ok: false,
        error: 'A simulated location cannot be used to verify your country.',
      };
    }

    if (
      requiresManagedCountryVerification
      && (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy > 150)
    ) {
      return {
        ok: false,
        error: 'Location accuracy is too low. Move outdoors, enable precise location and try again.',
      };
    }

    const { data: preciseRows, error } = await supabase.rpc('set_my_precise_location' as any, {
      p_latitude: latitude,
      p_longitude: longitude,
      p_accuracy_meters: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const savedProfileId = Array.isArray(preciseRows) ? preciseRows[0]?.profile_id : null;
    if (savedProfileId && savedProfileId !== profileId) {
      return { ok: false, error: 'The saved location did not match your active profile.' };
    }

    const { data: geocodeData, error: geocodeError } = await supabase.functions.invoke('reverse-geocode', {
      body: {
        latitude,
        longitude,
        accuracyMeters: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
        mocked,
        deviceIntegrity: 'unavailable',
      },
    });
    // The precise save is authoritative. Reverse geocoding is enrichment only;
    // if it is temporarily unavailable the existing city remains intact.
    if (requiresManagedCountryVerification && geocodeError) {
      return { ok: false, error: geocodeError.message || 'Country verification is temporarily unavailable.' };
    }

    if (requiresManagedCountryVerification && geocodeData?.ok === false) {
      return {
        ok: false,
        error: geocodeData?.error || geocodeData?.verification?.message || 'Country verification failed.',
      };
    }

    return {
      ok: true,
      verification: geocodeData?.verification,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to save location.' };
  }
}

/**
 * Save a coarse, manual location (city/region) and mark precision as city-level.
 * Clears stored coordinates to avoid implying exact position.
 */
export type ManualCityLocationDraft = {
  countryCode: string;
  countryName?: string | null;
  city: string;
  region?: string | null;
  localityGeonameId?: number | null;
  localityDistrict?: string | null;
  localityAdmin1Code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export async function saveManualCityLocation(
  profileId: string,
  draft: ManualCityLocationDraft,
): Promise<Result> {
  try {
    const city = draft.city.trim();
    const normalizedCountryCode = draft.countryCode.trim().toUpperCase();
    if (!normalizedCountryCode) return { ok: false, error: 'Please select a country.' };
    if (!city) return { ok: false, error: 'Please choose a verified city or town.' };

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('country_lock_policy, current_country_code')
      .eq('id', profileId)
      .single();
    if (profileError) {
      return { ok: false, error: profileError.message };
    }
    if (
      isGhanaCountryManagedPolicy(profileRow?.country_lock_policy)
      && normalizedCountryCode
      && normalizedCountryCode !== normalizedCountryCodeFromProfile(profileRow)
    ) {
      return {
        ok: false,
        error: 'Current country is server-verified. Use precise location to verify a move before changing countries.',
      };
    }
    const resolvedCountry =
      draft.countryName?.trim() || findCountryByCode(normalizedCountryCode)?.label || null;
    const updateData: Record<string, unknown> = {
      ...buildProfileLocationUpdate({
        city,
        region: draft.region,
        country: resolvedCountry,
        localityGeonameId: draft.localityGeonameId,
        localityDistrict: draft.localityDistrict,
        localityAdmin1Code: draft.localityAdmin1Code,
        localityProvider: draft.localityGeonameId ? 'geonames' : null,
        latitude: draft.latitude,
        longitude: draft.longitude,
      }),
      current_country_code: normalizedCountryCode,
      current_country: resolvedCountry,
      location_updated_at: new Date().toISOString(),
    };

    let { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', profileId);

    if (
      error &&
      normalizedCountryCode !== 'GH' &&
      updateData.locality_geoname_id != null &&
      isLegacyGhanaLocalityForeignKeyError(error)
    ) {
      const fallbackUpdate = {
        ...updateData,
        locality_geoname_id: null,
        locality_admin1_code: null,
        locality_provider: null,
      };
      ({ error } = await supabase.from('profiles').update(fallbackUpdate).eq('id', profileId));
    }

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to save manual location.' };
  }
}

const normalizedCountryCodeFromProfile = (profile: { current_country_code?: string | null }) =>
  String(profile.current_country_code || 'GH').trim().toUpperCase();
