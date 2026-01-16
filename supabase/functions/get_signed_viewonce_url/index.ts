// @ts-nocheck
// Edge Function: generate signed URL for encrypted view-once media
// @deno-types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type SignedUrlRequest = {
  message_id: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message_id }: SignedUrlRequest = await req.json()
    if (!message_id) {
      return new Response(JSON.stringify({ error: 'message_id is required' }), {
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

    const service = createClient(supabaseUrl, supabaseServiceKey)
    const { data: message, error: messageError } = await service
      .from('messages')
      .select('id,sender_id,receiver_id,storage_path,view_once,e2ee,enc,status,message_type')
      .eq('id', message_id)
      .single()

    if (messageError || !message) {
      return new Response(JSON.stringify({ error: 'Message not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!message.view_once || !message.e2ee || message.message_type !== 'view_once') {
      return new Response(JSON.stringify({ error: 'Not a view-once encrypted media message' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (message.receiver_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!message.storage_path) {
      return new Response(JSON.stringify({ error: 'Missing storage path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (message.status === 'viewed' || message.viewed_at) {
      return new Response(JSON.stringify({ error: 'Already viewed' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: signed, error: signedError } = await service.storage
      .from('chat-media')
      .createSignedUrl(message.storage_path, 60)

    if (signedError || !signed) {
      return new Response(JSON.stringify({ error: 'Unable to sign URL' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        signed_url: signed.signedUrl,
        expires_in: signed.expiresIn ?? 60,
        enc: message.enc,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('get_signed_viewonce_url error', error)
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
