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

interface SendVerificationRequest {
  phoneNumber: string
  userId?: string | null
  signupSessionId?: string
}

interface TwilioCarrierInfo {
  name?: string
  type?: string
}

interface TwilioLookupInfo {
  carrier?: TwilioCarrierInfo
}

interface TwilioVerifyResponse {
  sid: string
  status: string
  valid: boolean
  lookup?: TwilioLookupInfo
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
    return { allowed: false, error: 'Rate limiter unavailable' }
  }
  const row = Array.isArray(data) ? data[0] : data
  return {
    allowed: !!row?.allowed,
    count: row?.current_count ?? 0,
    windowBucket: row?.window_bucket_out ?? row?.window_bucket ?? null,
  }
}

function cleanPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '')
  
  // Handle Ghana numbers
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `+233${cleaned.substring(1)}`
  }
  
  // Add + if missing
  if (!cleaned.startsWith('+')) {
    return `+${cleaned}`
  }
  
  return cleaned
}

function calculatePhoneScore(phoneNumber: string, carrierInfo?: TwilioCarrierInfo): number {
  let score = 0
  
  // Ghana mobile prefixes (higher confidence)
  const ghanaMobilePrefixes = ['20', '23', '24', '26', '27', '28', '50', '54', '55', '56', '57', '59']
  const cleanNumber = phoneNumber.replace(/\D/g, '')
  
  if (cleanNumber.startsWith('233')) {
    const prefix = cleanNumber.substring(3, 5)
    if (ghanaMobilePrefixes.includes(prefix)) {
      score += 40 // High confidence for Ghana mobile
    } else {
      score += 25 // Medium confidence for Ghana landline
    }
  } else {
    score += 15 // Lower confidence for international numbers
  }
  
  // Carrier information bonus
  if (carrierInfo?.name) {
    score += 10
  }
  if (carrierInfo?.type === 'mobile') {
    score += 15
  }
  
  return Math.min(score, 100)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phoneNumber, userId, signupSessionId }: SendVerificationRequest = await req.json()
    
    const missing: string[] = []
    if (!phoneNumber) missing.push('phoneNumber')
    if (!signupSessionId) missing.push('signupSessionId')
    if (missing.length > 0) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields',
          missing,
          hasUserId: !!userId,
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Clean and format phone number
    const cleanedPhone = cleanPhoneNumber(phoneNumber)
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Rate limits (defaults)
    const clientIp = getClientIp(req) || 'unknown'
    const environment = Deno.env.get('ENVIRONMENT') || 'production'
    const rateChecks = [
      { name: 'ip_10min', key: `ip:${clientIp}`, windowSeconds: 600, limit: 5 },
      { name: 'phone_10min', key: `phone:${cleanedPhone}`, windowSeconds: 600, limit: 3 },
      { name: 'signup_10min', key: `signup:${signupSessionId}`, windowSeconds: 600, limit: 5 },
    ]
    if (environment !== 'development') {
      rateChecks.splice(2, 0, { name: 'phone_day', key: `phone:${cleanedPhone}:day`, windowSeconds: 86400, limit: 5 })
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
          ? 'Too many requests. Please wait and try again after 24 hours.'
          : 'Too many requests. Please wait and try again.'
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

    // Send verification via Twilio
    const twilioUrl = `https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/Verifications`
    const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`)
    
    const formData = new URLSearchParams()
    formData.append('To', cleanedPhone)
    formData.append('Channel', 'sms')
    formData.append('Locale', 'en')
    
    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${twilioAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData
    })

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text()
      let errorJson: any = null
      try {
        errorJson = JSON.parse(errorText)
      } catch {
        errorJson = null
      }
      const twilioError =
        errorJson?.message || errorJson?.error || errorText || 'Unknown Twilio error'
      const twilioCode = errorJson?.code || errorJson?.status
      console.error('Twilio error:', twilioCode, twilioError)
      return new Response(
        JSON.stringify({
          error: 'Failed to send verification code',
          twilioError,
          twilioCode,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const twilioData: TwilioVerifyResponse = await twilioResponse.json()
    
    // Calculate confidence score
    const confidenceScore = calculatePhoneScore(cleanedPhone, twilioData.lookup?.carrier)
    
    // Store verification attempt in database
    const { error: dbError } = await supabase
      .from('phone_verifications')
      .insert({
        signup_session_id: signupSessionId,
        user_id: userId ?? null,
        phone_number: cleanedPhone,
        verification_sid: twilioData.sid,
        confidence_score: confidenceScore,
        carrier_name: twilioData.lookup?.carrier?.name,
        carrier_type: twilioData.lookup?.carrier?.type,
        status: 'pending',
        request_ip: clientIp,
        request_user_agent: req.headers.get('user-agent')
      })

    if (dbError) {
      console.error('Database error:', dbError)
      return new Response(
        JSON.stringify({ error: 'Failed to store verification' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        verificationSid: twilioData.sid,
        phoneNumber: cleanedPhone,
        carrierInfo: twilioData.lookup?.carrier
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
