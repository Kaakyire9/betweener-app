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
  userId: string
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
    const { phoneNumber, userId }: SendVerificationRequest = await req.json()
    
    if (!phoneNumber || !userId) {
      return new Response(
        JSON.stringify({ error: 'Phone number and user ID are required' }),
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
      const error = await twilioResponse.text()
      console.error('Twilio error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to send verification code' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
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
        user_id: userId,
        phone_number: cleanedPhone,
        verification_sid: twilioData.sid,
        confidence_score: confidenceScore,
        carrier_name: twilioData.lookup?.carrier?.name,
        carrier_type: twilioData.lookup?.carrier?.type,
        status: 'pending'
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
        confidenceScore,
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