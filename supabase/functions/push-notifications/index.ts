// @ts-nocheck
// Edge Function: send Expo push notifications
// @deno-types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type PushRequest = {
  user_id: string
  title: string
  body: string
  data?: Record<string, unknown>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const secret = Deno.env.get('PUSH_WEBHOOK_SECRET')
    if (secret) {
      const url = new URL(req.url)
      const headerSecret = req.headers.get('x-push-secret')
      const querySecret =
        url.searchParams.get('x-push-secret') ??
        url.searchParams.get('secret')
      const providedSecret = headerSecret || querySecret
      if (!providedSecret || providedSecret !== secret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const payload: PushRequest = await req.json()
    console.log('push-notifications payload', payload)
    if (!payload?.user_id || !payload?.title || !payload?.body) {
      return new Response(JSON.stringify({ error: 'user_id, title, body are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const service = createClient(supabaseUrl, supabaseServiceKey)

    const { data: tokens, error } = await service
      .from('push_tokens')
      .select('token')
      .eq('user_id', payload.user_id)

    if (error) {
      return new Response(JSON.stringify({ error: 'Unable to load tokens' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('push-notifications tokens', {
      user_id: payload.user_id,
      count: tokens?.length ?? 0,
    })

    const expoMessages = (tokens || []).map((row) => ({
      to: row.token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      channelId: 'default',
      data: payload.data || {},
    }))

    if (!expoMessages.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(expoMessages),
    })
    const result = await expoResponse.json()

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('push-notifications error', error)
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
