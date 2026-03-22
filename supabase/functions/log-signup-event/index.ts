// @ts-nocheck
// Supabase Edge Function - runs in Deno runtime
// TypeScript errors are expected in VS Code Node.js environment

// @deno-types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const pickNullableText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const pickNullableNumber = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await req.json()) as Record<string, unknown>
    const signupSessionId = pickNullableText(body?.signup_session_id)

    if (!signupSessionId) {
      return new Response(
        JSON.stringify({ error: 'signup_session_id is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const authHeader = req.headers.get('Authorization') ?? ''
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    let authedUserId: string | null = null
    if (bearer) {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser(bearer)
        authedUserId = !authError && authData?.user?.id ? authData.user.id : null
      } catch {
        authedUserId = null
      }
    }

    const payload = {
      signup_session_id: signupSessionId,
      user_id: authedUserId,
      phone_number: pickNullableText(body.phone_number),
      phone_verified: authedUserId ? body.phone_verified === true : false,
      auth_method: pickNullableText(body.auth_method),
      oauth_provider: pickNullableText(body.oauth_provider),
      ip_address: pickNullableText(body.ip_address),
      ip_country: pickNullableText(body.ip_country),
      ip_region: pickNullableText(body.ip_region),
      ip_city: pickNullableText(body.ip_city),
      ip_timezone: pickNullableText(body.ip_timezone),
      geo_lat: pickNullableNumber(body.geo_lat),
      geo_lng: pickNullableNumber(body.geo_lng),
      geo_accuracy: pickNullableNumber(body.geo_accuracy),
      device_os: pickNullableText(body.device_os),
      device_model: pickNullableText(body.device_model),
      app_version: pickNullableText(body.app_version),
    }

    const { error } = await supabase
      .from('signup_events')
      .upsert(payload, {
        onConflict: 'signup_session_id',
        ignoreDuplicates: false,
      })

    if (error) {
      console.error('signup_events upsert error', error)
      return new Response(
        JSON.stringify({ error: 'Failed to log signup event' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('log-signup-event error', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
