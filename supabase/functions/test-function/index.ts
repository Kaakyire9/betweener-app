// @ts-nocheck
// Simple test function without authentication

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test function working!',
        receivedData: body,
        environment: {
          hasTwilioSid: !!Deno.env.get('TWILIO_ACCOUNT_SID'),
          hasTwilioToken: !!Deno.env.get('TWILIO_AUTH_TOKEN'),
          hasSupabaseUrl: !!Deno.env.get('SUPABASE_URL'),
          hasServiceKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: 'Test function error', 
        message: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})