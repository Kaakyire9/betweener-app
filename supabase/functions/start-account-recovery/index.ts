// @ts-nocheck
// Verified automatic account recovery dispatch.
// This function is only callable by the authenticated requester who already
// proved possession of the conflicting phone number.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type RecoveryStartBody = {
  recoveryToken?: string | null
  method?: string | null
}

const EMAIL_REDIRECT_TO = 'https://getbetweener.com/auth/callback'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: RecoveryStartBody = await req.json()
    const recoveryToken = String(body?.recoveryToken ?? '').trim()
    const method = String(body?.method ?? '').trim().toLowerCase()

    if (!recoveryToken) {
      return new Response(JSON.stringify({ error: 'recoveryToken is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    const authHeader = req.headers.get('Authorization') ?? ''
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!bearer) {
      return new Response(JSON.stringify({ error: 'authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: authData, error: authError } = await serviceClient.auth.getUser(bearer)
    const requesterUserId = !authError && authData?.user?.id ? authData.user.id : null
    const requesterEmail = !authError ? authData?.user?.email?.trim().toLowerCase() ?? null : null
    if (!requesterUserId) {
      return new Response(JSON.stringify({ error: 'authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: sessionRow, error: sessionError } = await serviceClient
      .from('account_recovery_sessions')
      .select('id,recovery_token,requester_user_id,owner_user_id,expires_at,dispatch_count,last_dispatched_at')
      .eq('recovery_token', recoveryToken)
      .eq('requester_user_id', requesterUserId)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (sessionError || !sessionRow) {
      return new Response(JSON.stringify({ error: 'Recovery session expired or not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (method !== 'email') {
      return new Response(JSON.stringify({ error: 'Only automatic email recovery is supported here' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (sessionRow.last_dispatched_at) {
      const lastSentAt = new Date(sessionRow.last_dispatched_at).getTime()
      if (Date.now() - lastSentAt < 60_000) {
        return new Response(JSON.stringify({ error: 'A recovery link was already sent moments ago. Please check that inbox.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if ((sessionRow.dispatch_count ?? 0) >= 3) {
      return new Response(JSON.stringify({ error: 'Recovery link limit reached for this session. Please restart verification.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let ownerUserId = sessionRow.owner_user_id

    const { data: mergedRow } = await serviceClient
      .from('merged_accounts')
      .select('target_user_id')
      .eq('source_user_id', ownerUserId)
      .eq('status', 'active')
      .maybeSingle()

    if (mergedRow?.target_user_id) {
      ownerUserId = mergedRow.target_user_id
    }

    const { data: ownerUser, error: ownerError } = await serviceClient.auth.admin.getUserById(ownerUserId)
    const ownerEmail = !ownerError ? ownerUser?.user?.email ?? null : null

    if (!ownerEmail) {
      return new Response(JSON.stringify({ error: 'No recoverable email was found for the older account.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const normalizedOwnerEmail = ownerEmail.trim().toLowerCase()

    if (
      requesterUserId !== ownerUserId &&
      requesterEmail &&
      requesterEmail === normalizedOwnerEmail
    ) {
      const emailParts = normalizedOwnerEmail.includes('@') ? normalizedOwnerEmail.split('@') : [normalizedOwnerEmail, '']
      const local = emailParts[0] ?? ''
      const domain = emailParts[1] ?? ''
      const emailHint =
        local && domain
          ? `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain.slice(0, 1)}${'*'.repeat(Math.max(domain.length - 3, 2))}${domain.slice(-2)}`
          : null

      return new Response(
        JSON.stringify({
          error:
            'This email is already attached to the newer sign-in too, so an email link could reopen the duplicate account. Use the older account password instead.',
          code: 'email_recovery_ambiguous_duplicate_address',
          emailHint,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const { error: otpError } = await serviceClient.auth.signInWithOtp({
      email: normalizedOwnerEmail,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: EMAIL_REDIRECT_TO,
      },
    })

    if (otpError) {
      return new Response(JSON.stringify({ error: otpError.message || 'Unable to send recovery email link' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const emailParts = normalizedOwnerEmail.includes('@') ? normalizedOwnerEmail.split('@') : [normalizedOwnerEmail, '']
    const local = emailParts[0] ?? ''
    const domain = emailParts[1] ?? ''
    const emailHint =
      local && domain
        ? `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain.slice(0, 1)}${'*'.repeat(Math.max(domain.length - 3, 2))}${domain.slice(-2)}`
        : null

    await serviceClient
      .from('account_recovery_sessions')
      .update({
        dispatch_count: (sessionRow.dispatch_count ?? 0) + 1,
        last_dispatched_at: new Date().toISOString(),
      })
      .eq('id', sessionRow.id)

    return new Response(
      JSON.stringify({
        success: true,
        sent: true,
        method: 'email',
        emailHint,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('start-account-recovery error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
