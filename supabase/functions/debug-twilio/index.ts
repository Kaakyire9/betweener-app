// @ts-nocheck
// Debug function to test Twilio integration

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phoneNumber } = await req.json()
    
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const twilioVerifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID')
    
    // Debug environment variables
    const debugInfo = {
      hasTwilioSid: !!twilioAccountSid,
      hasToken: !!twilioAuthToken,
      hasServiceSid: !!twilioVerifyServiceSid,
      sidPrefix: twilioAccountSid?.substring(0, 5),
      serviceSidPrefix: twilioVerifyServiceSid?.substring(0, 5),
      phoneNumber: phoneNumber
    }
    
    // Try Twilio API call with detailed error handling
    const twilioUrl = `https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/Verifications`
    const twilioAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`)
    
    const formData = new URLSearchParams()
    formData.append('To', phoneNumber)
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
    
    const responseText = await twilioResponse.text()
    let twilioData
    try {
      twilioData = JSON.parse(responseText)
    } catch {
      twilioData = { rawResponse: responseText }
    }
    
    return new Response(
      JSON.stringify({
        success: twilioResponse.ok,
        status: twilioResponse.status,
        statusText: twilioResponse.statusText,
        debugInfo,
        twilioResponse: twilioData,
        url: twilioUrl
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: 'Debug function error', 
        message: error.message,
        stack: error.stack 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})