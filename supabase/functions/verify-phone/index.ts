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
  userId: string
}

interface TwilioVerifyCheckResponse {
  sid: string
  status: 'approved' | 'pending' | 'canceled'
  valid: boolean
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phoneNumber, verificationCode, userId }: VerifyPhoneRequest = await req.json()
    
    if (!phoneNumber || !verificationCode || !userId) {
      return new Response(
        JSON.stringify({ error: 'Phone number, verification code, and user ID are required' }),
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
    const updateData: any = {
      status: twilioData.status === 'approved' ? 'verified' : 'failed',
      verified_at: twilioData.status === 'approved' ? new Date().toISOString() : null,
      attempts: 1 // You might want to increment this based on existing attempts
    }

    const { error: updateError } = await supabase
      .from('phone_verifications')
      .update(updateData)
      .eq('user_id', userId)
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
      // Get the verification record to get confidence score
      const { data: verificationData } = await supabase
        .from('phone_verifications')
        .select('confidence_score')
        .eq('user_id', userId)
        .eq('phone_number', phoneNumber)
        .eq('status', 'verified')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const confidenceScore = verificationData?.confidence_score || 50

      // Update user profile with phone verification
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          phone_number: phoneNumber,
          phone_verified: true,
          phone_verification_score: confidenceScore,
          verification_score: supabase.sql`COALESCE(verification_score, 0) + ${confidenceScore}`
        })
        .eq('id', userId)

      if (profileError) {
        console.error('Profile update error:', profileError)
        // Don't fail the request, but log the error
      }
    }

    return new Response(
      JSON.stringify({
        success: twilioData.status === 'approved',
        status: twilioData.status,
        valid: twilioData.valid,
        verified: twilioData.status === 'approved'
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