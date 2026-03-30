// @ts-nocheck
// Supabase Edge Function - runs in Deno runtime

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type AdminUpdateBody = {
  requestId?: string
  status?: string
  reviewNotes?: string | null
  linkedMergeCaseId?: string | null
}

const methodLabel = (value?: string | null) => {
  switch (String(value || '').trim().toLowerCase()) {
    case 'google':
      return 'Google'
    case 'apple':
      return 'Apple'
    case 'magic_link':
      return 'Email link'
    case 'email':
      return 'Email + password'
    default:
      return 'your usual sign-in method'
  }
}

const sendRecoveryResolvedEmail = async (args: {
  to: string
  previousSignInMethod?: string | null
  supportEmail?: string | null
}) => {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const resendFrom = Deno.env.get('RESEND_FROM_EMAIL')
  const supportEmail = args.supportEmail || Deno.env.get('BETWEENER_SUPPORT_EMAIL') || 'support@getbetweener.com'

  if (!resendApiKey || !resendFrom) {
    return { sent: false, reason: 'email_not_configured' as const }
  }

  const restoredMethod = methodLabel(args.previousSignInMethod)
  const subject = 'Your Betweener account is ready'
  const text = [
    'Your Betweener account recovery is complete.',
    '',
    `Please sign out of any current Betweener session and sign back in using ${restoredMethod}.`,
    '',
    'If you still reach the wrong account, reply to this email and our team will help you finish the recovery.',
    '',
    `Support: ${supportEmail}`,
  ].join('\n')

  const html = `
    <div style="background:#f7f1eb;padding:32px 20px;font-family:Inter,Arial,sans-serif;color:#102020;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:24px;padding:32px;border:1px solid rgba(16,32,32,0.08);box-shadow:0 18px 44px rgba(16,32,32,0.08);">
        <div style="display:inline-block;padding:8px 12px;border-radius:999px;background:rgba(22,199,195,0.1);color:#118c8b;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Account restored</div>
        <h1 style="margin:18px 0 12px;font-size:32px;line-height:1.1;font-family:Georgia,'Times New Roman',serif;color:#102020;">Your Betweener account is ready</h1>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#314141;">
          We’ve completed your account recovery.
        </p>
        <div style="border-radius:18px;background:#f8fbfb;padding:18px 18px 16px;border:1px solid rgba(17,140,139,0.12);margin-bottom:18px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#118c8b;margin-bottom:8px;">Next step</div>
          <div style="font-size:16px;line-height:1.7;color:#102020;">
            Please sign out of any current Betweener session, then sign back in using <strong>${restoredMethod}</strong>.
          </div>
        </div>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#4a5a5a;">
          If you still reach the wrong account, reply to this email and we’ll help you finish the recovery.
        </p>
        <p style="margin:0;font-size:14px;line-height:1.7;color:#6a7a7a;">
          Support: <a href="mailto:${supportEmail}" style="color:#118c8b;text-decoration:none;">${supportEmail}</a>
        </p>
      </div>
    </div>
  `

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resendFrom,
      to: [args.to],
      subject,
      html,
      text,
      reply_to: supportEmail,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Resend email error:', errorText)
    return { sent: false, reason: 'email_send_failed' as const, detail: errorText }
  }

  return { sent: true as const }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { requestId, status, reviewNotes, linkedMergeCaseId }: AdminUpdateBody = await req.json()
    if (!requestId || !status) {
      return new Response(JSON.stringify({ error: 'requestId and status are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data: beforeRow, error: beforeError } = await serviceClient
      .from('account_recovery_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()

    if (beforeError || !beforeRow) {
      return new Response(JSON.stringify({ error: 'Recovery request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: updated, error: rpcError } = await userClient.rpc('rpc_admin_update_account_recovery_request', {
      p_request_id: requestId,
      p_status: status,
      p_review_notes: reviewNotes ?? null,
      p_linked_merge_case_id: linkedMergeCaseId ?? null,
    })

    if (rpcError || !updated) {
      return new Response(JSON.stringify({ error: rpcError?.message || 'Unable to update recovery request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let emailSent = false
    let emailTo: string | null = null
    let emailWarning: string | null = null

    const nextStatus = String(status).trim().toLowerCase()
    const shouldNotifyResolved = beforeRow.status !== 'resolved' && nextStatus === 'resolved'

    if (shouldNotifyResolved) {
      let fallbackEmail: string | null = null
      try {
        const { data: userData } = await serviceClient.auth.admin.getUserById(beforeRow.requester_user_id)
        fallbackEmail = userData?.user?.email ?? null
      } catch (error) {
        console.error('Requester email lookup failed:', error)
      }

      emailTo = beforeRow.contact_email || fallbackEmail

      if (emailTo) {
        const emailResult = await sendRecoveryResolvedEmail({
          to: emailTo,
          previousSignInMethod: beforeRow.previous_sign_in_method,
        })
        emailSent = emailResult.sent === true
        if (!emailSent) {
          emailWarning = emailResult.reason ?? 'email_send_failed'
        }
      } else {
        emailWarning = 'missing_contact_email'
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications: {
          inAppNoticeReady: shouldNotifyResolved,
          emailSent,
          emailTo,
          warning: emailWarning,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('admin-update-account-recovery-request error:', error)
    return new Response(JSON.stringify({ error: error?.message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
