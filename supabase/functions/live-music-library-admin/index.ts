// @ts-nocheck -- checked by the function-local Deno configuration.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

const MAX_BYTES = 50 * 1024 * 1024;
const MOODS = new Set([
  'chill', 'afrobeats_light', 'soul', 'warm', 'upbeat', 'reflective',
  'instrumental', 'closing',
]);
const MIME_EXTENSIONS = new Map([
  ['audio/mpeg', 'mp3'],
  ['audio/mp4', 'm4a'],
  ['audio/aac', 'aac'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
]);

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json',
    Pragma: 'no-cache',
  },
});

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
};

const boundedText = (form: FormData, name: string, max: number) => {
  const value = String(form.get(name) ?? '').trim();
  return value.length > 0 && value.length <= max ? value : null;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let uploadedPath: string | null = null;
  try {
    const authorization = request.headers.get('Authorization')?.trim() ?? '';
    if (!authorization.startsWith('Bearer ')) return json(401, { error: 'unauthorized' });
    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const caller = createClient(supabaseUrl, requiredEnv('SUPABASE_ANON_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const service = createClient(supabaseUrl, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user?.id) return json(401, { error: 'unauthorized' });
    const { data: isAdmin, error: adminError } = await service.rpc('is_admin_user', {
      p_user_id: authData.user.id,
    });
    if (adminError || isAdmin !== true) return json(403, { error: 'live_music_admin_required' });

    const form = await request.formData();
    const file = form.get('file');
    const title = boundedText(form, 'title', 120);
    const artist = boundedText(form, 'artist', 120);
    const mood = boundedText(form, 'mood', 40);
    const licenseReference = boundedText(form, 'licenseReference', 240);
    const durationSeconds = Number(form.get('durationSeconds'));
    const containsVocals = String(form.get('containsVocals') ?? 'false') === 'true';
    const extension = file instanceof File ? MIME_EXTENSIONS.get(file.type) : null;
    if (!(file instanceof File) || file.size < 1 || file.size > MAX_BYTES || !extension
      || !title || !artist || !mood || !MOODS.has(mood) || !licenseReference
      || !Number.isSafeInteger(durationSeconds) || durationSeconds < 10
      || durationSeconds > 7200) {
      return json(400, { error: 'live_music_upload_invalid' });
    }

    const trackId = crypto.randomUUID();
    uploadedPath = `programme/${new Date().getUTCFullYear()}/admin/${trackId}.${extension}`;
    const { error: uploadError } = await service.storage.from('live-program-music').upload(
      uploadedPath,
      await file.arrayBuffer(),
      { contentType: file.type === 'audio/x-wav' ? 'audio/wav' : file.type, upsert: false },
    );
    if (uploadError) return json(503, { error: 'live_music_upload_failed' });

    const { data: registration, error: registrationError } = await caller.rpc(
      'rpc_admin_publish_live_music_track_v2',
      {
        p_track_id: trackId,
        p_title: title,
        p_artist: artist,
        p_storage_path: uploadedPath,
        p_mood: mood,
        p_duration_seconds: durationSeconds,
        p_contains_vocals: containsVocals,
        p_license_reference: licenseReference,
        p_license_expires_at: null,
      },
    );
    if (registrationError || registration?.trackId !== trackId) {
      await service.storage.from('live-program-music').remove([uploadedPath]);
      uploadedPath = null;
      return json(409, { error: 'live_music_registration_failed' });
    }

    return json(200, { ok: true, trackId, title, artist });
  } catch (error) {
    if (uploadedPath) {
      try {
        const cleanup = createClient(
          requiredEnv('SUPABASE_URL'),
          requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        await cleanup.storage.from('live-program-music').remove([uploadedPath]);
      } catch {
        // The path is retained in the structured log for operational cleanup.
      }
    }
    console.info('[live-music-library-admin] unavailable', {
      name: error instanceof Error ? error.name : 'unknown',
      orphanedUpload: uploadedPath !== null,
    });
    return json(500, { error: 'live_music_library_unavailable' });
  }
});
