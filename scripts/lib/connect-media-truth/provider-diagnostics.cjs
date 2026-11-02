// Diagnostic vocabulary only. Never copy provider prose, values, headers or URLs.
const settings = {
  limits: ['max_participants', 'max_duration_seconds'],
  audio: ['default_device', 'speaker_default_on', 'mic_default_on', 'access_request_enabled'],
  video: ['enabled', 'camera_default_on', 'camera_facing', 'access_request_enabled', 'target_resolution', 'target_resolution.width', 'target_resolution.height', 'target_resolution.bitrate'],
  screensharing: ['enabled', 'access_request_enabled', 'target_resolution'],
  recording: ['mode', 'quality', 'audio_only', 'layout'],
  transcription: ['mode', 'closed_caption_mode', 'language'],
  individual_recording: ['mode', 'output_types'], raw_recording: ['mode', 'audio_only'],
  frame_recording: ['mode', 'capture_interval_in_seconds', 'quality'],
  thumbnails: ['enabled'], ingress: ['enabled', 'audio_encoding_options', 'video_encoding_options'],
  broadcasting: ['enabled', 'hls', 'rtmp'],
};
const paths = ['ring', 'notify', 'video', 'data.created_by_id', 'data.members', 'data.members.user_id', 'data.members.role',
  'data.custom.media', 'data.custom.connect_media_truth_21', 'data.custom.connect_media_truth_b2_24', 'data.custom.connect_media_truth_b3_28',
  ...Object.entries(settings).flatMap(([group, names]) => names.map((name) => `data.settings_override.${group}.${name}`))];
const pathSet = new Set(paths);
const aliases = new Map();
const key = (value) => value.toLowerCase().replace(/\[\d+\]|\.\d+(?=\.|$)/g, '').replace(/[^a-z0-9]/g, '');
const add = (alias, path) => { const k = key(alias); aliases.set(k, aliases.has(k) && aliases.get(k) !== path ? null : path); };
for (const path of paths) {
  add(path, path); add(path.replace(/^data\./, ''), path);
  const parts = path.split('.');
  if (parts[1] === 'settings_override') {
    add(parts.at(-1), path); add(`${parts[2]}Settings.${parts.slice(3).join('.')}`, path);
  }
}
const rules = {
  required: /\brequired\b|\bmissing\b/i,
  minimum: /\bminimum\b|\bmin\b|>=|greater than/i,
  maximum: /\bmaximum\b|\bmax\b|<=|less than/i,
  enum: /\boneof\b|\bone of\b|\benum\b/i,
  type: /\btype\b|\binteger\b|\bboolean\b/i,
  unknown_field: /unknown field|unsupported field|unrecognized field/i,
  conflict: /incompatible|mutually exclusive|conflict/i,
};
const captures = new Set(['parsed', 'invalid_json', 'too_large', 'timeout', 'unavailable']);
const stages = { preflight: 'provider_preflight', createUsers: 'create_users', createCall: 'create_call',
  join: 'coordinator_join', get: 'observe_call', end: 'explicit_end', cleanup: 'cleanup' };
const operationStage = (operation) => typeof operation === 'string' && Object.hasOwn(stages, operation) ? stages[operation] : 'unknown_operation';
const projectStage = (stage) => [...Object.values(stages), 'unknown_operation'].includes(stage) ? stage : null;
const number = (n, min, max) => Number.isInteger(n) && n >= min && n <= max ? n : null;
const bounded = (value) => typeof value === 'string' ? value.slice(0, 16384) : '';
const fieldPaths = (text) => [...new Set((bounded(text).match(/[A-Za-z_][A-Za-z0-9_.\[\]]{0,200}/g) ?? [])
  .map((token) => aliases.get(key(token))).filter(Boolean))].slice(0, 32);

function projectDiagnostic(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const status = number(value.status, 100, 599); const code = number(value.code, -1, 99999);
  const version = value.version === 2 ? 2 : 1;
  const fields = [...new Set(Array.isArray(value.fields) ? value.fields.filter((p) => pathSet.has(p)) : [])].slice(0, 32);
  const fieldEvidence = Array.isArray(value.fieldEvidence) ? value.fieldEvidence.filter((row) => row && typeof row === 'object'
    && fields.includes(row.path) && ['message', 'exception_key'].includes(row.origin)
    && ['qualified_path', 'qualified_alias', 'bare_alias'].includes(row.match))
    .map((row) => ({ path: row.path, origin: row.origin, match: row.match })) : [];
  return { version, status, code,
    category: status === 400 && code === 4 ? 'input_error' : status >= 400 ? 'http_error' : 'unclassified',
    capture: captures.has(value.capture) ? value.capture : 'unavailable',
    fields,
    ...(version === 2 ? { fieldEvidence: [...new Map(fieldEvidence.map((row) => [JSON.stringify(row), row])).values()].slice(0, 32) } : {}),
    ruleHints: [...new Set(Array.isArray(value.ruleHints) ? value.ruleHints.filter((r) => typeof r === 'string' && Object.hasOwn(rules, r)) : [])].slice(0, 8),
    textOmitted: true };
}

// V2 preserves only finite origin/qualification labels. It never retains raw tokens or keys.
// V1 remains available for interpreting historical receipts and their regression controls.
function providerDiagnosticV2(error, httpStatus, capture = 'parsed') {
  const fieldEvidence = [];
  const recognize = (token, origin) => {
    const path = aliases.get(key(token)); if (!path) return;
    const normalized = token.toLowerCase().replace(/\[\d+\]|\.\d+(?=\.|$)/g, '');
    const match = normalized === path ? 'qualified_path' : /[.\[]/.test(normalized) ? 'qualified_alias' : 'bare_alias';
    fieldEvidence.push({ path, origin, match });
  };
  for (const token of bounded(error?.message).match(/[A-Za-z_][A-Za-z0-9_.\[\]]{0,200}/g) ?? []) recognize(token, 'message');
  const exceptionFields = error?.exception_fields;
  if (exceptionFields && typeof exceptionFields === 'object' && !Array.isArray(exceptionFields)) {
    for (const name of Object.keys(exceptionFields).slice(0, 32)) recognize(name, 'exception_key');
  }
  return projectDiagnostic({ ...providerDiagnostic(error, httpStatus, capture), version: 2, fieldEvidence });
}

function providerDiagnostic(error, httpStatus, capture = 'parsed') {
  const message = bounded(error?.message); const fields = fieldPaths(message);
  const hintTexts = fields.length ? [message] : [];
  const exceptionFields = error?.exception_fields;
  if (exceptionFields && typeof exceptionFields === 'object' && !Array.isArray(exceptionFields)) {
    for (const [name, description] of Object.entries(exceptionFields).slice(0, 32)) {
      // Only an entire known field path is admitted; unknown response keys are never retained.
      const path = aliases.get(key(name));
      if (path) { fields.push(path); hintTexts.push(bounded(description)); }
    }
  }
  return projectDiagnostic({ status: httpStatus ?? error?.status ?? error?.status_code ?? error?.metadata?.responseCode,
    code: error?.code, capture, fields,
    ruleHints: Object.entries(rules).filter(([, pattern]) => hintTexts.some((text) => pattern.test(text))).map(([rule]) => rule) });
}

async function captureErrorResponse(response, { maxBytes = 32768, timeoutMs = 250, diagnosticVersion = 1 } = {}) {
  if (response.status >= 200 && response.status < 300) return null;
  let reader; let timer;
  const extract = diagnosticVersion === 2 ? providerDiagnosticV2 : providerDiagnostic;
  const empty = (capture) => extract(null, response.status, capture);
  const collect = async () => {
    try {
      reader = response.clone().body?.getReader(); if (!reader) return empty('unavailable');
      const chunks = []; let total = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        total += value.byteLength; if (total > maxBytes) return empty('too_large'); chunks.push(value);
      }
      const bytes = new Uint8Array(total); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return empty('invalid_json'); }
      return extract(body, response.status);
    } catch { return empty('unavailable'); }
  };
  try {
    return await Promise.race([collect(), new Promise((resolve) => { timer = setTimeout(() => resolve(empty('timeout')), timeoutMs); })]);
  } finally {
    clearTimeout(timer);
    // A tee branch's cancellation can wait for the SDK branch. Never await it here.
    if (reader) void reader.cancel().catch(() => {});
  }
}
module.exports = { providerDiagnostic, providerDiagnosticV2, projectDiagnostic, captureErrorResponse, operationStage, projectStage };
