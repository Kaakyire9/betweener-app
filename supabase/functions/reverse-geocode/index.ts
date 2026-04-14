// @ts-nocheck
// Supabase Edge Function - runs in Deno runtime
// TypeScript errors are expected in VS Code Node.js environment

// @deno-types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type ReverseGeocodeRequest = {
  latitude: number
  longitude: number
}

const buildLocationLabel = (city?: string, region?: string, country?: string) => {
  if (city && region) return `${city}, ${region}`
  if (city && country) return `${city}, ${country}`
  if (city) return city
  if (region && country) return `${region}, ${country}`
  return region || country || ''
}

const normalizePlace = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const stripAdministrativeSuffix = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const cleaned = raw
    .replace(/\bmetropolitan municipality\b/gi, '')
    .replace(/\bmetropolitan district\b/gi, '')
    .replace(/\bmunicipal district\b/gi, '')
    .replace(/\bmetropolitan\b/gi, '')
    .replace(/\bmunicipality\b/gi, '')
    .replace(/\bdistrict\b/gi, '')
    .replace(/\bcounty\b/gi, '')
    .replace(/\bregion\b/gi, '')
    .replace(/\bprovince\b/gi, '')
    .replace(/\bstate\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,\-–]+$/g, '')
    .trim()

  return cleaned || raw
}

const resolveLocality = (address: Record<string, unknown>) => {
  const coarseRegion = String(address.state || address.region || '').trim()
  const coarseCountry = String(address.country || '').trim()
  const coarseSet = new Set(
    [coarseRegion, coarseCountry]
      .map(normalizePlace)
      .filter(Boolean),
  )

  const candidates = [
    address.city,
    address.town,
    address.village,
    address.suburb,
    address.neighbourhood,
    address.hamlet,
    address.city_district,
    address.state_district,
    address.municipality,
    address.county,
  ]

  for (const candidate of candidates) {
    const trimmed = String(candidate || '').trim()
    if (!trimmed) continue
    const normalized = normalizePlace(trimmed)
    if (coarseSet.has(normalized)) continue

    const cleaned = stripAdministrativeSuffix(trimmed)
    const normalizedCleaned = normalizePlace(cleaned)
    if (normalizedCleaned && !coarseSet.has(normalizedCleaned)) {
      return cleaned
    }

    return trimmed
  }

  return ''
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { latitude, longitude }: ReverseGeocodeRequest = await req.json()

    if (latitude == null || longitude == null) {
      return new Response(JSON.stringify({ error: 'Latitude and longitude are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: authData, error: authError } = await authClient.auth.getUser()
    const user = authData?.user
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', String(latitude))
    url.searchParams.set('lon', String(longitude))
    url.searchParams.set('zoom', '14')
    url.searchParams.set('addressdetails', '1')

    const email = Deno.env.get('NOMINATIM_EMAIL')
    if (email) {
      url.searchParams.set('email', email)
    }

    const ua = Deno.env.get('NOMINATIM_USER_AGENT') || 'Betweener/1.0'
    const geoRes = await fetch(url.toString(), {
      headers: {
        'User-Agent': ua,
        'Accept': 'application/json',
      },
    })

    if (!geoRes.ok) {
      const message = await geoRes.text()
      return new Response(JSON.stringify({ error: 'Reverse geocode failed', detail: message }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await geoRes.json()
    const address = data?.address || {}
    const city = resolveLocality(address)
    const region = address.state || address.region || address.county
    const country = address.country
    const countryCode = address.country_code ? String(address.country_code).toUpperCase() : null
    const location = buildLocationLabel(city, region, country)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('region, location, city, current_country, current_country_code')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const safeRegion = region || currentProfile?.region || country || 'Unknown'
    const safeCity = city || null
    const safeCountry = country || currentProfile?.current_country || null
    const safeCountryCode = countryCode || currentProfile?.current_country_code || null
    const fallbackLocation = buildLocationLabel(safeCity || undefined, safeRegion || undefined, safeCountry || undefined)
    const safeLocation = location || fallbackLocation || null

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        city: safeCity,
        region: safeRegion,
        location: safeLocation,
        current_country: safeCountry,
        current_country_code: safeCountryCode,
        location_precision: 'EXACT',
        location_updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        ok: true,
        location,
        city: city || null,
        region: region || null,
        country: country || null,
        country_code: countryCode || null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('reverse-geocode error', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
