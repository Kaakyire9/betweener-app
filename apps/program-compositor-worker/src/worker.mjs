import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, rm, mkdtemp, mkdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import {
  buildChromiumArguments,
  buildFfmpegArguments,
  buildRtmpTarget,
  classifyProcessFailure,
  dimensionsForCanvas,
  isLoopbackAddress,
  parseWorkerConfig,
  sanitizeDiagnostic,
  stableSessionSlug,
} from './compositor-runtime.mjs';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const rendererDirectory = normalize(join(sourceDirectory, '..', 'dist', 'renderer'));
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const ACTIVE_SESSION_STATUSES = new Set(['backstage', 'live', 'ending']);
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
]);
const ADAPTIVE_STAGE_DIAGNOSTIC_EVENTS = new Set([
  'adaptive_stage_v2_shadow_plan_generated',
  'adaptive_stage_v2_shadow_match',
  'adaptive_stage_v2_shadow_divergence',
  'adaptive_stage_v2_invalid_assignment_rejected',
  'adaptive_stage_v2_manifest_mismatch',
  'adaptive_stage_v2_source_identity_missing',
  'adaptive_stage_v2_arbitrary_fallback_prevented',
  'adaptive_stage_v2_plan_generation_error',
]);

const json = (response, body, status = 200) => {
  response.writeHead(status, {
    'cache-control': 'no-store, max-age=0',
    'content-type': 'application/json; charset=utf-8',
    pragma: 'no-cache',
  });
  response.end(JSON.stringify(body));
};

const command = (executable, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-8_192); });
  child.stderr?.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-8_192); });
  child.once('error', reject);
  child.once('exit', (code) => {
    if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    else reject(new Error(`command_failed:${executable}:${code}:${stderr.slice(-500)}`));
  });
});

const trackedProcess = (executable, args, options = {}) => {
  const child = spawn(executable, args, {
    ...options,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  const tracked = { child, stderr: '', spawnErrorCode: null, exit: null };
  child.stderr?.on('data', (chunk) => {
    tracked.stderr = `${tracked.stderr}${chunk}`.slice(-16_384);
  });
  child.once('error', (error) => {
    tracked.spawnErrorCode = typeof error?.code === 'string' ? error.code : null;
    tracked.exit = { code: null, signal: null };
  });
  child.once('exit', (code, signal) => { tracked.exit = { code, signal }; });
  return tracked;
};

const terminate = async (tracked, graceMilliseconds = 4_000) => {
  if (!tracked?.child || tracked.exit) return;
  tracked.child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => tracked.child.once('exit', resolve)),
    delay(graceMilliseconds).then(() => {
      if (!tracked.exit) tracked.child.kill('SIGKILL');
    }),
  ]);
};

class ProgramCompositorWorker {
  constructor(configuration) {
    this.configuration = configuration;
    this.workerInstanceId = configuration.workerInstanceId || randomUUID();
    this.sessions = new Map();
    this.usedDisplays = new Set();
    this.stopping = false;
    this.ready = false;
    this.lastSuccessfulPollAt = null;
    this.runtimeDirectory = null;
    this.pulseEnvironment = null;
    this.server = null;
  }

  log(event, details = {}) {
    console.log(JSON.stringify({
      scope: 'program-compositor-worker',
      event,
      workerInstanceId: this.workerInstanceId,
      ...details,
    }));
  }

  async api(action, fields = {}) {
    const response = await fetch(
      `${this.configuration.supabaseUrl}/functions/v1/live-broadcast-orchestrator`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-broadcast-worker-token': this.configuration.workerToken,
        },
        body: JSON.stringify({ action, workerInstanceId: this.workerInstanceId, ...fields }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      throw new Error(`broadcast_orchestrator_${action}_${response.status}`);
    }
    return payload;
  }

  allocateDisplay() {
    for (let offset = 0; offset < 100; offset += 1) {
      const display = this.configuration.displayBase + offset;
      if (!this.usedDisplays.has(display)) {
        this.usedDisplays.add(display);
        return display;
      }
    }
    throw new Error('broadcast_compositor_display_capacity_exhausted');
  }

  async ensurePulseServer() {
    if (this.pulseEnvironment) return this.pulseEnvironment;
    const xdgRuntimeDirectory = join(this.runtimeDirectory, 'pulse-runtime');
    await mkdir(xdgRuntimeDirectory, { recursive: true, mode: 0o700 });
    const environment = {
      ...process.env,
      XDG_RUNTIME_DIR: xdgRuntimeDirectory,
      PULSE_SERVER: `unix:${join(xdgRuntimeDirectory, 'pulse', 'native')}`,
    };
    await command(this.configuration.pulseaudioPath, [
      '--daemonize=yes', '--exit-idle-time=-1', '--disallow-exit', '--log-level=warning',
    ], { env: environment });
    let lastError = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        await command(this.configuration.pactlPath, ['info'], { env: environment });
        this.pulseEnvironment = environment;
        return environment;
      } catch (error) {
        lastError = error;
        await delay(100);
      }
    }
    throw lastError ?? new Error('broadcast_compositor_pulse_unavailable');
  }

  async createPulseSink(sessionId) {
    const environment = await this.ensurePulseServer();
    const sinkName = `betweener_${stableSessionSlug(sessionId)}`;
    const result = await command(this.configuration.pactlPath, [
      'load-module', 'module-null-sink', `sink_name=${sinkName}`,
      `sink_properties=device.description=${sinkName}`,
    ], { env: environment });
    const moduleId = Number(result.stdout);
    if (!Number.isSafeInteger(moduleId) || moduleId < 1) {
      throw new Error('broadcast_compositor_pulse_sink_invalid');
    }
    return { environment, moduleId, sinkName, monitor: `${sinkName}.monitor` };
  }

  async waitForDisplay(display, tracked) {
    const socket = `/tmp/.X11-unix/X${display}`;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (tracked.exit) break;
      try {
        const value = await stat(socket);
        if (value.isSocket()) return;
      } catch {}
      await delay(50);
    }
    throw new Error(classifyProcessFailure('xvfb', tracked.stderr, tracked.spawnErrorCode));
  }

  async waitForRenderer(state) {
    const deadline = Date.now() + this.configuration.rendererTimeoutMilliseconds;
    while (Date.now() < deadline) {
      if (state.rendererStatus === 'ready') return;
      if (state.rendererStatus === 'failed' || state.chromium.exit) {
        throw new Error(state.rendererFailureReason ?? classifyProcessFailure(
          'chromium', state.chromium.stderr, state.chromium.spawnErrorCode,
        ));
      }
      await delay(100);
    }
    throw new Error('broadcast_compositor_renderer_timeout');
  }

  outputStatuses(state) {
    return {
      hlsStatus: state.snapshot.outputs?.hls === true ? 'starting' : 'disabled',
      recordingStatus: state.snapshot.outputs?.recording === true
        ? 'pending_consent' : 'disabled',
      captionsStatus: state.snapshot.outputs?.captions === true ? 'starting' : 'disabled',
    };
  }

  async heartbeat(state, compositorStatus = 'live', failureReasonCode = null) {
    const statuses = this.outputStatuses(state);
    const payload = await this.api('heartbeat', {
      sessionId: state.sessionId,
      leaseGeneration: state.leaseGeneration,
      programVersion: Number(state.snapshot.program.programVersion),
      compositorStatus,
      hlsStatus: statuses.hlsStatus,
      hlsPlaylistUrl: null,
      recordingStatus: statuses.recordingStatus,
      captionsStatus: statuses.captionsStatus,
      failureReasonCode,
    });
    if (payload.heartbeat?.renewed !== true) {
      throw new Error('broadcast_compositor_lease_lost');
    }
    state.lastHeartbeatAt = Date.now();
  }

  async getSnapshot(sessionId, leaseGeneration) {
    const payload = await this.api('snapshot', { sessionId, leaseGeneration });
    return payload.snapshot;
  }

  async refreshCredentials(state) {
    const expiresAt = Date.parse(String(state.credentials.expiresAt ?? ''));
    if (Number.isFinite(expiresAt) && expiresAt - Date.now() > 5 * 60_000) {
      return state.credentials;
    }
    if (state.credentialsPromise) return state.credentialsPromise;
    state.credentialsPromise = this.api('credentials', {
      sessionId: state.sessionId,
      leaseGeneration: state.leaseGeneration,
    }).then((payload) => {
      if (!payload.credentials?.callToken) {
        throw new Error('broadcast_compositor_credentials_invalid');
      }
      state.credentials = payload.credentials;
      return state.credentials;
    }).finally(() => { state.credentialsPromise = null; });
    return state.credentialsPromise;
  }

  async startSession(claim) {
    const sessionId = String(claim.sessionId);
    const leaseGeneration = Number(claim.leaseGeneration);
    const snapshot = await this.getSnapshot(sessionId, leaseGeneration);
    if (snapshot?.available !== true) throw new Error('broadcast_compositor_snapshot_unavailable');
    const display = this.allocateDisplay();
    const dimensions = dimensionsForCanvas(snapshot.program?.targetCanvas);
    const slug = stableSessionSlug(sessionId);
    const profilePath = join(this.runtimeDirectory, `chromium-${slug}`);
    await mkdir(profilePath, { recursive: true, mode: 0o700 });
    const nonce = randomBytes(32).toString('hex');
    const pulse = await this.createPulseSink(sessionId);
    const state = {
      sessionId,
      leaseGeneration,
      display,
      dimensions,
      profilePath,
      nonce,
      pulse,
      snapshot,
      credentials: {
        apiKey: claim.apiKey,
        callToken: claim.callToken,
        call: claim.call,
        user: { id: claim.providerUserId, name: 'Betweener Program' },
        expiresAt: claim.expiresAt,
      },
      credentialsPromise: null,
      rendererStatus: 'booting',
      rendererFailureReason: null,
      lastHeartbeatAt: 0,
      xvfb: null,
      chromium: null,
      ffmpeg: null,
      intentionalStop: false,
    };
    this.sessions.set(sessionId, state);
    try {
      state.xvfb = trackedProcess(this.configuration.xvfbPath, [
        `:${display}`, '-screen', '0', `${dimensions.width}x${dimensions.height}x24`,
        '-nolisten', 'tcp', '-noreset',
      ], { env: pulse.environment });
      await this.waitForDisplay(display, state.xvfb);
      await this.heartbeat(state, 'starting');

      const rendererUrl = `http://127.0.0.1:${this.configuration.port}/renderer`
        + `?session=${encodeURIComponent(sessionId)}&nonce=${encodeURIComponent(nonce)}`;
      state.chromium = trackedProcess(this.configuration.chromiumPath,
        buildChromiumArguments({
          display, width: dimensions.width, height: dimensions.height, rendererUrl, profilePath,
        }), {
          env: { ...pulse.environment, DISPLAY: `:${display}`, PULSE_SINK: pulse.sinkName },
        });
      await this.waitForRenderer(state);
      await this.heartbeat(state, 'ready');

      const outputUrl = buildRtmpTarget(String(claim.output?.rtmpAddress), String(claim.output?.streamKey));
      state.ffmpeg = trackedProcess(this.configuration.ffmpegPath, buildFfmpegArguments({
        display,
        width: dimensions.width,
        height: dimensions.height,
        pulseMonitor: pulse.monitor,
        outputUrl,
      }), { env: pulse.environment });
      await delay(2_000);
      if (state.ffmpeg.exit) {
        throw new Error(classifyProcessFailure(
          'ffmpeg', state.ffmpeg.stderr, state.ffmpeg.spawnErrorCode,
        ));
      }
      await this.heartbeat(state, 'live');
      this.log('compositor_started', {
        sessionId,
        leaseGeneration,
        canvas: snapshot.program.targetCanvas,
        width: dimensions.width,
        height: dimensions.height,
      });
      return state;
    } catch (error) {
      await this.cleanupSessionResources(state);
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  async cleanupSessionResources(state) {
    state.intentionalStop = true;
    await terminate(state.ffmpeg);
    await terminate(state.chromium);
    await terminate(state.xvfb);
    if (state.pulse?.moduleId) {
      await command(this.configuration.pactlPath,
        ['unload-module', String(state.pulse.moduleId)],
        { env: state.pulse.environment }).catch(() => undefined);
    }
    this.usedDisplays.delete(state.display);
    await rm(state.profilePath, { recursive: true, force: true }).catch(() => undefined);
  }

  async release(state, reasonCode) {
    await this.cleanupSessionResources(state);
    try {
      await this.api('release', {
        sessionId: state.sessionId,
        leaseGeneration: state.leaseGeneration,
        reasonCode,
      });
    } finally {
      this.sessions.delete(state.sessionId);
      this.log('compositor_released', { sessionId: state.sessionId, reasonCode });
    }
  }

  async reconcile(work) {
    const sessionId = String(work.sessionId);
    let state = this.sessions.get(sessionId);
    if (!ACTIVE_SESSION_STATUSES.has(String(work.sessionStatus))) {
      if (state) await this.release(state, 'broadcast_session_inactive');
      return;
    }
    if (!state) {
      if (this.sessions.size >= this.configuration.maximumSessions) return;
      const payload = await this.api('claim', { sessionId });
      if (payload.claim?.claimed === true) {
        try {
          await this.startSession({ ...payload.claim, sessionId });
        } catch (error) {
          await this.api('release', {
            sessionId,
            leaseGeneration: Number(payload.claim.leaseGeneration),
            reasonCode: 'broadcast_compositor_start_failed',
          }).catch(() => undefined);
          throw error;
        }
      }
      return;
    }

    const failedProcess = [
      ['xvfb', state.xvfb], ['chromium', state.chromium], ['ffmpeg', state.ffmpeg],
    ].find(([, tracked]) => tracked?.exit && !state.intentionalStop);
    if (failedProcess) {
      const [name, tracked] = failedProcess;
      const reason = classifyProcessFailure(name, tracked.stderr, tracked.spawnErrorCode);
      this.log('compositor_process_failed', {
        sessionId,
        process: name,
        reason,
        diagnostic: sanitizeDiagnostic(tracked.stderr, [
          state.credentials.callToken,
          state.credentials.apiKey,
        ]) || null,
      });
      await this.release(state, reason);
      return;
    }

    const snapshot = await this.getSnapshot(sessionId, state.leaseGeneration);
    if (snapshot?.available !== true) {
      await this.release(state, 'broadcast_compositor_lease_lost');
      return;
    }
    state.snapshot = snapshot;
    if (Date.now() - state.lastHeartbeatAt >= this.configuration.heartbeatMilliseconds) {
      await this.heartbeat(state, 'live');
    }
  }

  async poll() {
    const payload = await this.api('discover', { limit: this.configuration.maximumSessions });
    const work = Array.isArray(payload.work) ? payload.work : [];
    const seen = new Set();
    for (const item of work) {
      if (this.stopping) break;
      seen.add(String(item.sessionId));
      try {
        await this.reconcile(item);
      } catch (error) {
        this.log('session_reconcile_failed', {
          sessionId: String(item?.sessionId ?? ''),
          reason: error instanceof Error ? error.message : 'unknown',
        });
        const state = this.sessions.get(String(item?.sessionId ?? ''));
        if (state) await this.release(state, 'broadcast_compositor_reconcile_failed').catch(() => undefined);
      }
    }
    for (const state of this.sessions.values()) {
      if (!seen.has(state.sessionId)) {
        await this.reconcile({ sessionId: state.sessionId, sessionStatus: 'live' });
      }
    }
    this.lastSuccessfulPollAt = new Date().toISOString();
    this.ready = true;
  }

  sessionForRequest(request, sessionId) {
    if (!isLoopbackAddress(request.socket.remoteAddress)) return null;
    const state = this.sessions.get(sessionId);
    const nonce = request.headers['x-compositor-nonce'];
    return state && typeof nonce === 'string' && nonce === state.nonce ? state : null;
  }

  async serveStatic(response, path) {
    const relative = path === '/renderer' ? 'index.html' : path.replace(/^\/(?:assets\/)?/, 'assets/');
    const target = normalize(join(rendererDirectory, relative));
    if (!target.startsWith(rendererDirectory)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const content = await readFile(target);
      response.writeHead(200, {
        'cache-control': relative === 'index.html' ? 'no-store' : 'public, max-age=31536000, immutable',
        'content-type': MIME_TYPES.get(extname(target)) ?? 'application/octet-stream',
        'x-content-type-options': 'nosniff',
      });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  }

  startServer() {
    this.server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', `http://127.0.0.1:${this.configuration.port}`);
        if (url.pathname === '/healthz') {
          const healthy = this.ready && !this.stopping;
          json(response, {
            healthy,
            activeCompositors: this.sessions.size,
            maximumCompositors: this.configuration.maximumSessions,
            lastSuccessfulPollAt: this.lastSuccessfulPollAt,
            sourceRevision: this.configuration.sourceRevision,
            buildIdentifier: this.configuration.buildIdentifier,
            manifestVersion: this.configuration.manifestVersion,
            resolverVersion: this.configuration.resolverVersion,
          }, healthy ? 200 : 503);
          return;
        }
        if (!isLoopbackAddress(request.socket.remoteAddress)) {
          response.writeHead(403).end();
          return;
        }
        if (url.pathname === '/renderer') {
          const state = this.sessions.get(url.searchParams.get('session') ?? '');
          if (!state || url.searchParams.get('nonce') !== state.nonce) {
            response.writeHead(404).end();
            return;
          }
          await this.serveStatic(response, '/renderer');
          return;
        }
        if (url.pathname.startsWith('/assets/')) {
          await this.serveStatic(response, url.pathname);
          return;
        }
        const match = url.pathname.match(/^\/internal\/session\/([0-9a-f-]+)\/(bootstrap|state|token|readiness|diagnostic)$/i);
        if (!match) {
          response.writeHead(404).end();
          return;
        }
        const state = this.sessionForRequest(request, match[1]);
        if (!state) {
          response.writeHead(403).end();
          return;
        }
        if (match[2] === 'bootstrap' && request.method === 'GET') {
          json(response, {
            schemaVersion: 1,
            ...state.credentials,
            snapshot: state.snapshot,
          });
          return;
        }
        if (match[2] === 'state' && request.method === 'GET') {
          json(response, state.snapshot);
          return;
        }
        if (match[2] === 'token' && request.method === 'POST') {
          const credentials = await this.refreshCredentials(state);
          json(response, { callToken: credentials.callToken, expiresAt: credentials.expiresAt });
          return;
        }
        if (match[2] === 'readiness' && request.method === 'POST') {
          let raw = '';
          for await (const chunk of request) {
            raw += chunk;
            if (raw.length > 2_048) throw new Error('renderer_readiness_too_large');
          }
          const body = JSON.parse(raw || '{}');
          if (!['ready', 'failed'].includes(body.status)) throw new Error('renderer_readiness_invalid');
          state.rendererStatus = body.status;
          state.rendererFailureReason = typeof body.reasonCode === 'string'
            ? body.reasonCode.slice(0, 120) : null;
          json(response, { ok: true });
          return;
        }
        if (match[2] === 'diagnostic' && request.method === 'POST') {
          let raw = '';
          for await (const chunk of request) {
            raw += chunk;
            if (raw.length > 4_096) throw new Error('renderer_diagnostic_too_large');
          }
          const body = JSON.parse(raw || '{}');
          const safeDetails = body.safeDetails;
          if (!ADAPTIVE_STAGE_DIAGNOSTIC_EVENTS.has(body.eventName)
            || !safeDetails || typeof safeDetails !== 'object' || Array.isArray(safeDetails)) {
            throw new Error('renderer_diagnostic_invalid');
          }
          await this.api('diagnostic', {
            sessionId: state.sessionId,
            leaseGeneration: state.leaseGeneration,
            eventName: body.eventName,
            safeDetails,
          });
          json(response, { ok: true });
          return;
        }
        response.writeHead(405).end();
      } catch {
        json(response, { error: 'compositor_local_control_failed' }, 500);
      }
    });
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.configuration.port, '0.0.0.0', resolve);
    });
  }

  async run() {
    await stat(join(rendererDirectory, 'index.html'));
    this.runtimeDirectory = await mkdtemp(join(tmpdir(), 'betweener-compositor-'));
    await this.startServer();
    await this.ensurePulseServer();
    this.log('worker_started', {
      maximumSessions: this.configuration.maximumSessions,
      sourceRevision: this.configuration.sourceRevision,
      buildIdentifier: this.configuration.buildIdentifier,
      manifestVersion: this.configuration.manifestVersion,
      resolverVersion: this.configuration.resolverVersion,
    });
    while (!this.stopping) {
      try {
        await this.poll();
      } catch (error) {
        this.ready = false;
        this.log('poll_failed', { reason: error instanceof Error ? error.message : 'unknown' });
      }
      if (!this.stopping) await delay(this.configuration.pollMilliseconds);
    }
  }

  async shutdown(signal) {
    if (this.stopping) return;
    this.stopping = true;
    this.ready = false;
    this.log('worker_stopping', { signal });
    this.server?.close();
    await Promise.allSettled([...this.sessions.values()].map((state) => (
      this.release(state, 'broadcast_compositor_worker_shutdown')
    )));
    if (this.runtimeDirectory) {
      await rm(this.runtimeDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

const configuration = parseWorkerConfig(process.env);
const worker = new ProgramCompositorWorker(configuration);
process.once('SIGTERM', () => { void worker.shutdown('sigterm'); });
process.once('SIGINT', () => { void worker.shutdown('sigint'); });
await worker.run();
