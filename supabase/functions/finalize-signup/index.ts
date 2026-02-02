// @ts-nocheck
// Supabase Edge Function - runs in Deno runtime
// @deno-types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface FinalizeSignupRequest {
  signupSessionId: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { signupSessionId }: FinalizeSignupRequest = await req.json()
    if (!signupSessionId) {
      return new Response(
        JSON.stringify({ error: 'Signup session ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: verification, error: verificationError } = await supabase
      .from('phone_verifications')
      .select('phone_number, confidence_score, status')
      .eq('signup_session_id', signupSessionId)
      .eq('status', 'verified')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (verificationError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch verification' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!verification?.phone_number) {
      return new Response(JSON.stringify({ error: 'No verified phone found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const normalizedScore = Math.max(0, Math.min(1, (verification.confidence_score ?? 0) / 100))

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('verification_level')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!profileRow) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'profile_not_created' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const nextLevel = Math.max(profileRow?.verification_level ?? 0, 1)

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        phone_number: verification.phone_number,
        phone_verified: true,
        phone_verification_score: normalizedScore,
        verification_level: nextLevel,
      })
      .eq('user_id', user.id)

    if (profileError) {
      return new Response(JSON.stringify({ error: 'Failed to update profile' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: signupError } = await supabase
      .from('signup_events')
      .update({ user_id: user.id })
      .eq('signup_session_id', signupSessionId)

    if (signupError) {
      console.log('Signup event link error', signupError)
    }

    return new Response(
      JSON.stringify({ success: true, phone_number: verification.phone_number }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Finalize signup error', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
