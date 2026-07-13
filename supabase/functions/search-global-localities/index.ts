// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const normalize = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim()

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') || ''
  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: authData, error: authError } = await authClient.auth.getUser()
  if (authError || !authData?.user) return json({ error: 'Unauthorized' }, 401)

  const body = await req.json().catch(() => ({}))
  const countryCode = normalize(body.countryCode).toUpperCase()
  const query = normalize(body.query)
  const limit = Math.max(1, Math.min(Number(body.limit) || 20, 30))
  if (!/^[A-Z]{2}$/.test(countryCode)) return json({ error: 'A valid ISO country code is required.' }, 400)
  if (query.length < 2 || query.length > 80) return json({ error: 'Search must contain 2 to 80 characters.' }, 400)

  const admin = createClient(supabaseUrl, serviceKey)
  const serialize = (row: any) => ({
    geonameId: Number(row.geoname_id), name: row.name,
    countryCode: row.country_code, countryName: row.country_name,
    admin1Code: row.admin1_code, admin1Name: row.admin1_name,
    latitude: Number(row.latitude), longitude: Number(row.longitude),
    population: Number(row.population) || null, featureCode: row.feature_code,
    timezone: row.timezone, provider: row.provider,
  })

  const { data: cached } = await admin.from('global_localities').select('*')
    .eq('country_code', countryCode).ilike('name', `${query}%`)
    .order('population', { ascending: false }).limit(limit)
  if (cached?.length) return json({ results: cached.map(serialize), source: 'cache' })

  const username = Deno.env.get('GEONAMES_USERNAME')
  if (!username) {
    return cached?.length
      ? json({ results: cached.map(serialize), source: 'cache' })
      : json({ error: 'Global place search is not configured.' }, 503)
  }

  const url = new URL('https://secure.geonames.org/searchJSON')
  url.searchParams.set('name_startsWith', query)
  url.searchParams.set('country', countryCode)
  url.searchParams.set('featureClass', 'P')
  url.searchParams.set('isNameRequired', 'true')
  url.searchParams.set('orderby', 'population')
  url.searchParams.set('style', 'FULL')
  url.searchParams.set('maxRows', String(limit))
  url.searchParams.set('username', username)

  const response = await fetch(url)
  if (!response.ok) return json({ error: 'Place provider unavailable.' }, 502)
  const payload = await response.json()
  if (payload?.status) return json({ error: payload.status.message || 'Place provider error.' }, 502)

  const rows = (Array.isArray(payload?.geonames) ? payload.geonames : []).map((place: any) => ({
    geoname_id: Number(place.geonameId), name: normalize(place.name), ascii_name: normalize(place.asciiName) || null,
    country_code: countryCode, country_name: normalize(place.countryName),
    admin1_code: normalize(place.adminCode1) || null, admin1_name: normalize(place.adminName1) || null,
    latitude: Number(place.lat), longitude: Number(place.lng), population: Math.max(0, Number(place.population) || 0),
    feature_code: normalize(place.fcode) || 'PPL', timezone: normalize(place.timezone?.timeZoneId) || null,
    search_text: [place.name, place.asciiName, ...(place.alternateNames || [])].map(normalize).filter(Boolean).join(' ').slice(0, 4000),
    provider: 'geonames', refreshed_at: new Date().toISOString(),
  })).filter((row: any) => Number.isFinite(row.geoname_id) && row.name && row.country_name && Number.isFinite(row.latitude) && Number.isFinite(row.longitude))

  if (rows.length) await admin.from('global_localities').upsert(rows, { onConflict: 'geoname_id' })
  return json({ results: rows.map(serialize), source: 'provider' })
})
