// @ts-nocheck
// Edge Function: mark view-once media as viewed (and optionally delete object)
// @deno-types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type MarkViewedRequest = {
  message_id: string
  delete_object?: boolean
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message_id, delete_object }: MarkViewedRequest = await req.json()
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
      .select('id,sender_id,receiver_id,storage_path,status,view_once,e2ee,enc')
      .eq('id', message_id)
      .single()

    if (messageError || !message) {
      return new Response(JSON.stringify({ error: 'Message not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (message.receiver_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!message.view_once || !message.e2ee) {
      return new Response(JSON.stringify({ error: 'Not a view-once encrypted message' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (message.status === 'viewed') {
      return new Response(JSON.stringify({ ok: true, already: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const now = new Date().toISOString()
    const { error: updateError } = await service
      .from('messages')
      .update({ status: 'viewed', viewed_at: now, viewed_by: user.id })
      .eq('id', message_id)
      .eq('receiver_id', user.id)

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Unable to mark viewed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await service.from('message_views').upsert({ message_id, viewer_id: user.id })

    if (delete_object && message.storage_path) {
      await service.storage.from('chat-media').remove([message.storage_path])
    }

    return new Response(JSON.stringify({ ok: true, viewed_at: now }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('mark_viewonce_viewed error', error)
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
