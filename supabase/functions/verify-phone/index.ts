// @ts-nocheck
// Supabase Edge Function - runs in Deno runtime
// TypeScript errors are expected in VS Code Node.js environment

// @deno-types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
const twilioVerifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID')!

interface VerifyPhoneRequest {
  phoneNumber: string
  verificationCode: string
  userId?: string | null
  signupSessionId?: string
}

interface TwilioVerifyCheckResponse {
  sid: string
  status: 'approved' | 'pending' | 'canceled'
  valid: boolean
}

const getClientIp = (req: Request) => {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim()
  }
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || null
}

const enforceRateLimit = async (
  supabase: any,
  key: string,
  windowSeconds: number,
  limit: number
) => {
  const { data, error } = await supabase.rpc('bump_rate_limit', {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_limit: limit
  })
  if (error) {
    console.error('Rate limit error:', error)
    return { allowed: false }
  }
  const row = Array.isArray(data) ? data[0] : data
  return {
    allowed: !!row?.allowed,
    count: row?.current_count ?? 0,
    windowBucket: row?.window_bucket_out ?? row?.window_bucket ?? null,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phoneNumber, verificationCode, userId, signupSessionId }: VerifyPhoneRequest = await req.json()
    
    if (!phoneNumber || !verificationCode || !signupSessionId) {
      return new Response(
        JSON.stringify({ error: 'Phone number, verification code, and signup session ID are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Rate limits (defaults)
    const clientIp = getClientIp(req) || 'unknown'
    const environment = Deno.env.get('ENVIRONMENT') || 'production'
    const rateChecks = [
      { name: 'ip_10min', key: `ip:${clientIp}`, windowSeconds: 600, limit: 10 },
      { name: 'phone_10min', key: `phone:${phoneNumber}`, windowSeconds: 600, limit: 5 },
      { name: 'signup_10min', key: `signup:${signupSessionId}`, windowSeconds: 600, limit: 5 },
    ]
    if (environment !== 'development') {
      rateChecks.splice(2, 0, { name: 'phone_day', key: `phone:${phoneNumber}:day`, windowSeconds: 86400, limit: 5 })
    }
    const rateResults = await Promise.all(
      rateChecks.map(async (rule) => {
        const res = await enforceRateLimit(supabase, rule.key, rule.windowSeconds, rule.limit)
        return { ...rule, ...res }
      })
    )
    const blocked = rateResults.find((r) => !r.allowed)
    if (blocked) {
      const errorMessage =
        blocked.name === 'phone_day'
          ? 'Too many attempts. Please wait and try again after 24 hours.'
          : 'Too many attempts. Please wait and try again.'
      return new Response(
        JSON.stringify({
          error: errorMessage,
          limit: {
            name: blocked.name,
            key: blocked.key,
            windowSeconds: blocked.windowSeconds,
            limit: blocked.limit,
            count: blocked.count ?? null,
            windowBucket: blocked.windowBucket ?? null,
          },
          clientIp,
          serverTime: new Date().toISOString(),
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify code with Twilio
    const twilioUrl = `https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/VerificationCheck`
    const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`)
    
    const formData = new URLSearchParams()
    formData.append('To', phoneNumber)
    formData.append('Code', verificationCode)
    
    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${twilioAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData
    })

    if (!twilioResponse.ok) {
      const error = await twilioResponse.text()
      console.error('Twilio verification error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to verify code' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const twilioData: TwilioVerifyCheckResponse = await twilioResponse.json()
    
    // Update verification record in database
    const { data: latestRecord } = await supabase
      .from('phone_verifications')
      .select('attempts, confidence_score')
      .eq('signup_session_id', signupSessionId)
      .eq('phone_number', phoneNumber)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const attempts = (latestRecord?.attempts ?? 0) + 1
    const confidenceScore = latestRecord?.confidence_score ?? 0

    const updateData: any = {
      status: twilioData.status === 'approved' ? 'verified' : 'failed',
      verified_at: twilioData.status === 'approved' ? new Date().toISOString() : null,
      attempts
    }

    const { error: updateError } = await supabase
      .from('phone_verifications')
      .update(updateData)
      .eq('signup_session_id', signupSessionId)
      .eq('phone_number', phoneNumber)
      .eq('status', 'pending')

    if (updateError) {
      console.error('Database update error:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update verification status' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // If verification successful, update user profile
    if (twilioData.status === 'approved') {
      const { error: signupError } = await supabase
        .from('signup_events')
        .update({
          phone_number: phoneNumber,
          phone_verified: true,
          phone_verification_score: confidenceScore
        })
        .eq('signup_session_id', signupSessionId)

      if (signupError) {
        console.error('Signup event update error:', signupError)
      }
    }

    return new Response(
      JSON.stringify({
        success: twilioData.status === 'approved',
        status: twilioData.status,
        valid: twilioData.valid,
        verified: twilioData.status === 'approved',
        confidenceScore
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
