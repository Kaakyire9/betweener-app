import { createHash } from 'node:crypto';

const CANVAS_DIMENSIONS = Object.freeze({
  landscape_16_9: Object.freeze({ width: 1280, height: 720 }),
  portrait_9_16: Object.freeze({ width: 720, height: 1280 }),
  square_1_1: Object.freeze({ width: 1080, height: 1080 }),
});

const integerFrom = (value, fallback, minimum, maximum) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error('broadcast_compositor_configuration_invalid');
  }
  return parsed;
};

const required = (environment, name) => {
  const value = String(environment[name] ?? '').trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
};

export const parseWorkerConfig = (environment) => {
  const supabaseUrl = required(environment, 'SUPABASE_URL').replace(/\/+$/, '');
  const parsedUrl = new URL(supabaseUrl);
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== 'https:' && !(parsedUrl.protocol === 'http:' && isLoopback)) {
    throw new Error('broadcast_compositor_supabase_url_invalid');
  }
  const workerToken = required(environment, 'BROADCAST_COMPOSITOR_WORKER_TOKEN');
  if (new TextEncoder().encode(workerToken).byteLength < 32) {
    throw new Error('broadcast_compositor_worker_token_too_short');
  }
  const sourceRevision = String(environment.BETWEENER_SOURCE_REVISION ?? 'unknown')
    .trim().toLowerCase();
  if (sourceRevision !== 'unknown' && !/^[0-9a-f]{40}$/.test(sourceRevision)) {
    throw new Error('broadcast_compositor_source_revision_invalid');
  }
  return Object.freeze({
    supabaseUrl,
    workerToken,
    workerInstanceId: String(environment.BROADCAST_COMPOSITOR_WORKER_INSTANCE_ID ?? '').trim(),
    sourceRevision,
    buildIdentifier: String(environment.BETWEENER_BUILD_IDENTIFIER ?? 'unknown').trim(),
    manifestVersion: String(
      environment.ADAPTIVE_STAGE_MANIFEST_VERSION ?? 'adaptive-stage-v2.0.0-m1',
    ).trim(),
    resolverVersion: String(
      environment.ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION ?? 'layout-plan-v2.0.0-m1',
    ).trim(),
    port: integerFrom(environment.PORT, 8080, 1024, 65535),
    maximumSessions: integerFrom(environment.BROADCAST_COMPOSITOR_MAX_SESSIONS, 1, 1, 4),
    pollMilliseconds: integerFrom(environment.BROADCAST_COMPOSITOR_POLL_MS, 1_000, 250, 30_000),
    heartbeatMilliseconds: integerFrom(
      environment.BROADCAST_COMPOSITOR_HEARTBEAT_MS, 5_000, 1_000, 30_000,
    ),
    rendererTimeoutMilliseconds: integerFrom(
      environment.BROADCAST_COMPOSITOR_RENDERER_TIMEOUT_MS, 30_000, 5_000, 120_000,
    ),
    ffmpegPath: String(environment.FFMPEG_PATH ?? 'ffmpeg'),
    chromiumPath: String(environment.CHROMIUM_PATH ?? '/usr/bin/chromium'),
    xvfbPath: String(environment.XVFB_PATH ?? 'Xvfb'),
    pactlPath: String(environment.PACTL_PATH ?? 'pactl'),
    pulseaudioPath: String(environment.PULSEAUDIO_PATH ?? 'pulseaudio'),
    displayBase: integerFrom(environment.BROADCAST_COMPOSITOR_DISPLAY_BASE, 90, 10, 500),
  });
};

export const dimensionsForCanvas = (canvas) => (
  CANVAS_DIMENSIONS[canvas] ?? CANVAS_DIMENSIONS.landscape_16_9
);

export const buildRtmpTarget = (address, streamKey) => {
  if (!/^rtmps?:\/\//i.test(String(address ?? ''))) {
    throw new Error('broadcast_compositor_rtmp_address_invalid');
  }
  if (typeof streamKey !== 'string' || streamKey.length < 16) {
    throw new Error('broadcast_compositor_stream_key_invalid');
  }
  return `${address.replace(/\/+$/, '')}/${streamKey}`;
};

export const buildFfmpegArguments = ({ display, width, height, pulseMonitor, outputUrl }) => {
  if (!Number.isInteger(display) || display < 1
    || !Number.isInteger(width) || !Number.isInteger(height)
    || !/^[a-z][a-z0-9_.-]{0,62}\.monitor$/i.test(String(pulseMonitor ?? ''))
    || !/^rtmps?:\/\//i.test(String(outputUrl ?? ''))) {
    throw new Error('broadcast_compositor_ffmpeg_configuration_invalid');
  }
  return [
    '-hide_banner', '-loglevel', 'warning', '-nostats',
    '-thread_queue_size', '1024',
    '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30',
    '-video_size', `${width}x${height}`, '-i', `:${display}.0`,
    '-thread_queue_size', '2048',
    '-f', 'pulse', '-i', pulseMonitor,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
    '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
    '-r', '30', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-b:v', '4500k', '-maxrate', '5000k', '-bufsize', '9000k',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '160k',
    '-af', 'aresample=async=1:first_pts=0',
    '-flvflags', 'no_duration_filesize', '-f', 'flv', outputUrl,
  ];
};

export const buildChromiumArguments = ({ display, width, height, rendererUrl, profilePath }) => {
  if (!Number.isInteger(display) || display < 1 || !/^http:\/\/127\.0\.0\.1:/i.test(rendererUrl)) {
    throw new Error('broadcast_compositor_browser_configuration_invalid');
  }
  return [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--noerrdialogs',
    '--disable-session-crashed-bubble', '--disable-infobars', '--disable-extensions',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=Translate,MediaRouter',
    '--autoplay-policy=no-user-gesture-required', '--force-device-scale-factor=1',
    `--window-size=${width},${height}`, '--window-position=0,0', '--kiosk',
    `--user-data-dir=${profilePath}`, rendererUrl,
  ];
};

export const classifyProcessFailure = (processName, stderr, spawnErrorCode = null) => {
  if (spawnErrorCode === 'ENOENT') return `broadcast_compositor_${processName}_unavailable`;
  const message = String(stderr ?? '').toLowerCase();
  if (/not authorized|unauthorized|authentication failed|server error/.test(message)) {
    return 'broadcast_compositor_rtmp_rejected';
  }
  if (/connection refused|timed out|network is unreachable|could not resolve/.test(message)) {
    return 'broadcast_compositor_transport_unavailable';
  }
  if (/cannot open display|failed to open display/.test(message)) {
    return 'broadcast_compositor_display_unavailable';
  }
  if (/connection failure|access denied.*pulse|no such entity/.test(message)) {
    return 'broadcast_compositor_audio_unavailable';
  }
  return `broadcast_compositor_${processName}_failed`;
};

export const sanitizeDiagnostic = (diagnostic, sensitiveValues = []) => {
  let result = String(diagnostic ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  sensitiveValues.filter(Boolean).forEach((value) => {
    result = result.split(String(value)).join('[REDACTED]');
  });
  result = result.replace(/rtmps?:\/\/[^\s]+/gi, '[REDACTED_RTMP]');
  return result.slice(-1_000);
};

export const stableSessionSlug = (sessionId) => createHash('sha256')
  .update(String(sessionId))
  .digest('hex')
  .slice(0, 16);

export const isLoopbackAddress = (address) => {
  const normalized = String(address ?? '').replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1';
};
