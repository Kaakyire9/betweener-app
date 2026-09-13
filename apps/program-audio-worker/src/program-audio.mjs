import { createHash } from 'node:crypto';

export const clampProgrammeVolume = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(0.5, numeric));
};

export const buildRtmpTarget = (address, streamKey) => {
  if (!/^rtmps?:\/\//i.test(address)) throw new Error('invalid_rtmp_address');
  if (typeof streamKey !== 'string' || streamKey.length < 16) {
    throw new Error('invalid_stream_key');
  }
  return `${address.replace(/\/+$/, '')}/${streamKey}`;
};

export const buildFfmpegArguments = ({
  inputPath,
  outputUrl,
  offsetSeconds,
  repeatOne,
  volume,
  controlPort,
}) => {
  if (!inputPath || !outputUrl || !Number.isInteger(controlPort)
    || controlPort < 1024 || controlPort > 65535) {
    throw new Error('invalid_ffmpeg_configuration');
  }
  const args = ['-hide_banner', '-loglevel', 'warning', '-nostats', '-re'];
  if (repeatOne) args.push('-stream_loop', '-1');
  const safeOffset = Math.max(0, Number(offsetSeconds) || 0);
  if (safeOffset > 0) args.push('-ss', safeOffset.toFixed(3));
  args.push(
    '-i', inputPath,
    '-map', '0:a:0',
    // Node spawn() passes this argument directly to FFmpeg. Both the filter
    // graph and the azmq option parser consume an escape layer, so the
    // endpoint colons need two literal backslashes at runtime.
    '-af', `volume@programme=${clampProgrammeVolume(volume).toFixed(3)},azmq=b=tcp\\\\://127.0.0.1\\\\:${controlPort}`,
    '-vn',
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    '-b:a', '160k',
    '-f', 'flv',
    outputUrl,
  );
  return args;
};

export const cacheKeyForTrack = (claim) => createHash('sha256')
  .update(`${claim.trackId}:${claim.trackUpdatedAt}`)
  .digest('hex');

export const shouldCompleteBeforePublish = (claim, toleranceSeconds = 2) => {
  if (String(claim?.repeatMode) === 'one') return false;
  const duration = Number(claim?.durationSeconds);
  const offset = Number(claim?.offsetSeconds);
  const tolerance = Math.max(0, Math.min(5, Number(toleranceSeconds) || 0));
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(offset)) return false;
  return offset >= Math.max(0, duration - tolerance);
};

export const classifyFfmpegStartupFailure = (stderr, spawnErrorCode = null) => {
  if (spawnErrorCode === 'ENOENT') return 'program_audio_ffmpeg_unavailable';
  const message = String(stderr ?? '').toLowerCase();
  if (/no such filter.*azmq|filter not found.*azmq/.test(message)) {
    return 'program_audio_gain_filter_unavailable';
  }
  if (/error initializing filter ['"]?azmq|no option name near/.test(message)) {
    return 'program_audio_gain_filter_invalid';
  }
  if (/invalid data found|failed to read frame|could not find codec parameters/.test(message)) {
    return 'program_audio_track_invalid';
  }
  if (/connection refused|connection timed out|network is unreachable|cannot open connection/.test(message)) {
    return 'program_audio_rtmp_connection_failed';
  }
  if (/server error|authentication failed|not authorized|unauthorized/.test(message)) {
    return 'program_audio_rtmp_rejected';
  }
  if (/output file is empty|nothing was written|end of file/.test(message)) {
    return 'program_audio_track_exhausted';
  }
  return 'program_audio_ffmpeg_start_failed';
};

export const sanitizeFfmpegDiagnostic = (stderr, sensitiveValues = []) => {
  let diagnostic = String(stderr ?? '');
  for (const value of sensitiveValues) {
    const secret = String(value ?? '');
    if (secret) diagnostic = diagnostic.replaceAll(secret, '[redacted]');
  }
  diagnostic = diagnostic
    .replace(/rtmps?:\/\/\S+/gi, '[rtmp-target]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]{10,}){2}\b/g, '[token]')
    .replace(/[A-Za-z0-9_-]{96,}/g, '[credential]');
  const lines = diagnostic.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6);
  return lines.join(' | ').slice(0, 1_200);
};

export const parseWorkerConfig = (environment) => {
  const required = (name) => {
    const value = environment[name]?.trim();
    if (!value) throw new Error(`missing_${name.toLowerCase()}`);
    return value;
  };
  const supabaseUrl = required('SUPABASE_URL').replace(/\/+$/, '');
  if (!/^https:\/\//i.test(supabaseUrl)) throw new Error('invalid_supabase_url');
  const workerToken = required('PROGRAM_AUDIO_WORKER_TOKEN');
  if (workerToken.length < 32) throw new Error('invalid_program_audio_worker_token');
  const positiveInteger = (name, fallback, minimum, maximum) => {
    const value = environment[name] === undefined ? fallback : Number(environment[name]);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`invalid_${name.toLowerCase()}`);
    }
    return value;
  };
  return {
    supabaseUrl,
    workerToken,
    workerInstanceId: environment.PROGRAM_AUDIO_WORKER_INSTANCE_ID?.trim() || null,
    ffmpegPath: environment.FFMPEG_PATH?.trim() || 'ffmpeg',
    pythonPath: environment.PYTHON_PATH?.trim() || 'python3',
    pollMilliseconds: positiveInteger('PROGRAM_AUDIO_POLL_MS', 2_000, 500, 30_000),
    heartbeatMilliseconds: positiveInteger('PROGRAM_AUDIO_HEARTBEAT_MS', 8_000, 2_000, 30_000),
    maximumSessions: positiveInteger('PROGRAM_AUDIO_MAX_SESSIONS', 25, 1, 100),
    maximumTrackBytes: positiveInteger(
      'PROGRAM_AUDIO_MAX_TRACK_BYTES', 250 * 1024 * 1024, 1024, 1024 * 1024 * 1024,
    ),
    port: positiveInteger('PORT', 8_080, 1_024, 65_535),
  };
};
