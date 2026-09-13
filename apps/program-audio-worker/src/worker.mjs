import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  buildFfmpegArguments,
  buildRtmpTarget,
  cacheKeyForTrack,
  classifyFfmpegStartupFailure,
  clampProgrammeVolume,
  parseWorkerConfig,
  sanitizeFfmpegDiagnostic,
  shouldCompleteBeforePublish,
} from './program-audio.mjs';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const gainControlPath = join(sourceDirectory, 'gain-control.py');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class ProgrammeAudioWorker {
  constructor(configuration) {
    this.configuration = configuration;
    this.workerInstanceId = configuration.workerInstanceId || randomUUID();
    this.sessions = new Map();
    this.trackCache = new Map();
    this.usedControlPorts = new Set();
    this.stopping = false;
    this.ready = false;
    this.lastSuccessfulPollAt = null;
    this.cacheDirectory = null;
  }

  log(event, details = {}) {
    console.log(JSON.stringify({
      scope: 'program-audio-worker',
      event,
      workerInstanceId: this.workerInstanceId,
      ...details,
    }));
  }

  async api(action, fields = {}) {
    const response = await fetch(
      `${this.configuration.supabaseUrl}/functions/v1/live-program-audio-publisher`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-program-audio-worker-token': this.configuration.workerToken,
        },
        body: JSON.stringify({ action, workerInstanceId: this.workerInstanceId, ...fields }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      throw new Error(`publisher_api_${response.status}`);
    }
    return payload;
  }

  allocateControlPort(sessionId) {
    const seed = [...sessionId].reduce((total, character) => total + character.charCodeAt(0), 0);
    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      const port = 25_000 + ((seed + attempt) % 20_000);
      if (!this.usedControlPorts.has(port)) {
        this.usedControlPorts.add(port);
        return port;
      }
    }
    throw new Error('program_audio_control_port_unavailable');
  }

  async downloadTrack(claim) {
    const key = cacheKeyForTrack(claim);
    const cachedPath = this.trackCache.get(key);
    if (cachedPath) {
      try {
        const file = await stat(cachedPath);
        if (file.isFile() && file.size > 0) return cachedPath;
      } catch {
        this.trackCache.delete(key);
      }
    }
    const uri = new URL(claim.trackUri);
    if (uri.protocol !== 'https:') throw new Error('program_audio_track_uri_invalid');
    const response = await fetch(uri, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok || !response.body) throw new Error('program_audio_track_download_failed');
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength)
      && declaredLength > this.configuration.maximumTrackBytes) {
      throw new Error('program_audio_track_too_large');
    }
    const target = join(this.cacheDirectory, `${key}.audio`);
    const partialTarget = join(this.cacheDirectory, `${key}.${randomUUID()}.part`);
    let receivedBytes = 0;
    const source = Readable.fromWeb(response.body);
    source.on('data', (chunk) => {
      receivedBytes += chunk.length;
      if (receivedBytes > this.configuration.maximumTrackBytes) {
        source.destroy(new Error('program_audio_track_too_large'));
      }
    });
    try {
      await pipeline(source, createWriteStream(partialTarget, { flags: 'wx', mode: 0o600 }));
      await rename(partialTarget, target);
    } catch (error) {
      await rm(partialTarget, { force: true });
      throw error;
    }
    this.trackCache.set(key, target);
    return target;
  }

  async heartbeat(state, status = 'live', failureReasonCode = null) {
    const payload = await this.api('heartbeat', {
      sessionId: state.sessionId,
      leaseGeneration: state.leaseGeneration,
      musicVersion: state.musicVersion,
      trackId: state.trackId,
      volume: state.volume,
      status,
      failureReasonCode,
    });
    if (payload.heartbeat?.renewed !== true) {
      throw new Error('program_audio_lease_lost');
    }
    state.lastHeartbeatAt = Date.now();
  }

  async setGain(state, targetVolume) {
    const target = clampProgrammeVolume(targetVolume);
    const start = state.volume;
    for (let step = 1; step <= 5; step += 1) {
      const next = start + ((target - start) * step) / 5;
      await new Promise((resolve, reject) => {
        const child = spawn(
          this.configuration.pythonPath,
          [gainControlPath, String(state.controlPort), next.toFixed(3)],
          { stdio: 'ignore', windowsHide: true },
        );
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('program_audio_gain_timeout'));
        }, 3_000);
        child.once('error', (error) => { clearTimeout(timer); reject(error); });
        child.once('exit', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error('program_audio_gain_failed'));
        });
      });
      if (step < 5) await delay(40);
    }
    state.volume = target;
  }

  async completeFinishedClaim(sessionId, claim) {
    if (!shouldCompleteBeforePublish(claim)) return false;
    const payload = await this.api('complete', {
      sessionId,
      leaseGeneration: Number(claim.leaseGeneration),
      musicVersion: Number(claim.musicVersion),
    });
    if (payload.completion?.completed !== true) return false;
    await this.api('release', {
      sessionId,
      leaseGeneration: Number(claim.leaseGeneration),
      reasonCode: 'program_audio_completed_before_start',
    });
    this.log('track_completed_before_publish', {
      sessionId,
      musicVersion: Number(claim.musicVersion),
      trackId: String(claim.trackId),
      completionReason: String(payload.completion.reasonCode ?? 'program_audio_track_completed'),
    });
    return true;
  }

  async startPublisher(claim) {
    const sessionId = String(claim.sessionId);
    let activeClaim = claim;
    let inputPath = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      inputPath = await this.downloadTrack(activeClaim);
      const refreshed = await this.claim(sessionId);
      if (refreshed?.claimed !== true) throw new Error('program_audio_claim_rejected');
      if (String(refreshed.trackId) === String(activeClaim.trackId)
        && Number(refreshed.musicVersion) === Number(activeClaim.musicVersion)) {
        activeClaim = refreshed;
        break;
      }
      activeClaim = refreshed;
      inputPath = null;
    }
    if (!inputPath) throw new Error('program_audio_state_unstable');
    if (await this.completeFinishedClaim(sessionId, activeClaim)) return null;
    const controlPort = this.allocateControlPort(sessionId);
    const outputUrl = buildRtmpTarget(
      String(activeClaim.rtmpAddress),
      String(activeClaim.streamKey),
    );
    const args = buildFfmpegArguments({
      inputPath,
      outputUrl,
      offsetSeconds: activeClaim.offsetSeconds,
      repeatOne: activeClaim.repeatMode === 'one',
      volume: activeClaim.volume,
      controlPort,
    });
    const child = spawn(this.configuration.ffmpegPath, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    const state = {
      sessionId,
      leaseGeneration: Number(activeClaim.leaseGeneration),
      musicVersion: Number(activeClaim.musicVersion),
      trackId: String(activeClaim.trackId),
      repeatMode: String(activeClaim.repeatMode),
      volume: clampProgrammeVolume(activeClaim.volume),
      controlPort,
      child,
      intentionalStop: false,
      exit: null,
      ffmpegStderrTail: '',
      spawnErrorCode: null,
      lastHeartbeatAt: 0,
    };
    this.sessions.set(sessionId, state);
    child.stderr?.on('data', (chunk) => {
      state.ffmpegStderrTail = `${state.ffmpegStderrTail}${chunk.toString('utf8')}`.slice(-8_192);
    });
    child.once('error', (error) => {
      state.spawnErrorCode = typeof error?.code === 'string' ? error.code : null;
      state.exit = { code: null, failed: true };
    });
    child.once('exit', (code, signal) => {
      state.exit = { code, signal, failed: code !== 0 };
    });
    await this.heartbeat(state, 'starting');
    await delay(1_500);
    if (state.exit) {
      const reason = classifyFfmpegStartupFailure(
        state.ffmpegStderrTail,
        state.spawnErrorCode,
      );
      this.log('ffmpeg_start_failed', {
        sessionId,
        reason,
        exitCode: Number.isInteger(state.exit.code) ? state.exit.code : null,
        signal: state.exit.signal ?? null,
        diagnostic: sanitizeFfmpegDiagnostic(state.ffmpegStderrTail, [
          inputPath,
          outputUrl,
          activeClaim.rtmpAddress,
          activeClaim.streamKey,
        ]) || null,
      });
      throw new Error(reason);
    }
    await this.heartbeat(state, 'live');
    this.log('publisher_started', {
      sessionId,
      musicVersion: state.musicVersion,
      trackId: state.trackId,
      repeatMode: state.repeatMode,
    });
    return state;
  }

  async terminateProcess(state) {
    if (!state.child || state.child.exitCode !== null || state.child.signalCode !== null) return;
    state.intentionalStop = true;
    state.child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => state.child.once('exit', resolve)),
      delay(4_000).then(() => {
        if (state.child.exitCode === null && state.child.signalCode === null) {
          state.child.kill('SIGKILL');
        }
      }),
    ]);
  }

  async release(state, reasonCode) {
    await this.terminateProcess(state);
    try {
      await this.api('release', {
        sessionId: state.sessionId,
        leaseGeneration: state.leaseGeneration,
        reasonCode,
      });
    } finally {
      this.usedControlPorts.delete(state.controlPort);
      this.sessions.delete(state.sessionId);
    }
  }

  async claim(sessionId) {
    const payload = await this.api('claim', { sessionId });
    return payload.claim;
  }

  async reconcile(work) {
    const sessionId = String(work.sessionId);
    let state = this.sessions.get(sessionId);
    if (work.desiredStatus !== 'playing') {
      if (state) await this.release(state, 'program_audio_stopped');
      return;
    }
    if (!state) {
      const claim = await this.claim(sessionId);
      if (claim?.claimed === true) {
        if (await this.completeFinishedClaim(sessionId, { ...claim, sessionId })) return;
        try {
          await this.startPublisher({ ...claim, sessionId });
        } catch (error) {
          await this.api('release', {
            sessionId,
            leaseGeneration: Number(claim.leaseGeneration),
            reasonCode: 'program_audio_start_failed',
          }).catch(() => {});
          throw error;
        }
      }
      return;
    }
    if (state.exit) {
      if (!state.intentionalStop && !state.exit.failed && state.repeatMode !== 'one') {
        await this.api('complete', {
          sessionId,
          leaseGeneration: state.leaseGeneration,
          musicVersion: state.musicVersion,
        });
        await this.release(state, 'program_audio_completed');
      } else {
        try { await this.heartbeat(state, 'degraded', 'program_audio_transport_failed'); } catch {}
        await this.release(state, 'program_audio_transport_failed');
      }
      return;
    }
    if (Number(work.musicVersion) !== state.musicVersion) {
      const claim = await this.claim(sessionId);
      if (claim?.claimed !== true) {
        await this.release(state, 'program_audio_claim_rejected');
        return;
      }
      const sameTransport = String(claim.trackId) === state.trackId
        && String(claim.repeatMode) === state.repeatMode;
      if (sameTransport) {
        await this.setGain(state, claim.volume);
        state.musicVersion = Number(claim.musicVersion);
        state.leaseGeneration = Number(claim.leaseGeneration);
        await this.heartbeat(state, 'live');
      } else {
        await this.release(state, 'program_audio_transport_changed');
        const replacement = await this.claim(sessionId);
        if (replacement?.claimed === true) {
          try {
            await this.startPublisher({ ...replacement, sessionId });
          } catch (error) {
            await this.api('release', {
              sessionId,
              leaseGeneration: Number(replacement.leaseGeneration),
              reasonCode: 'program_audio_start_failed',
            }).catch(() => {});
            throw error;
          }
        }
      }
      return;
    }
    if (Date.now() - state.lastHeartbeatAt >= this.configuration.heartbeatMilliseconds) {
      await this.heartbeat(state, 'live');
    }
  }

  async poll() {
    const payload = await this.api('discover', { limit: this.configuration.maximumSessions });
    const work = Array.isArray(payload.work) ? payload.work : [];
    for (const item of work) {
      if (this.stopping) break;
      try {
        await this.reconcile(item);
      } catch (error) {
        this.log('session_reconcile_failed', {
          sessionId: String(item?.sessionId ?? ''),
          reason: error instanceof Error ? error.message : 'unknown',
        });
        const state = this.sessions.get(String(item?.sessionId ?? ''));
        if (state) {
          try { await this.release(state, 'program_audio_reconcile_failed'); } catch {}
        }
      }
    }
    this.lastSuccessfulPollAt = new Date().toISOString();
    this.ready = true;
  }

  startHealthServer() {
    this.healthServer = createServer((request, response) => {
      if (request.url !== '/healthz') {
        response.writeHead(404).end();
        return;
      }
      const healthy = this.ready && !this.stopping;
      response.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        healthy,
        activePublishers: this.sessions.size,
        lastSuccessfulPollAt: this.lastSuccessfulPollAt,
      }));
    });
    this.healthServer.listen(this.configuration.port, '0.0.0.0');
  }

  async run() {
    this.cacheDirectory = await mkdtemp(join(tmpdir(), 'betweener-program-audio-'));
    this.startHealthServer();
    this.log('worker_started');
    while (!this.stopping) {
      try {
        await this.poll();
      } catch (error) {
        this.ready = false;
        this.log('poll_failed', {
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
      if (!this.stopping) await delay(this.configuration.pollMilliseconds);
    }
  }

  async shutdown(signal) {
    if (this.stopping) return;
    this.stopping = true;
    this.ready = false;
    this.log('worker_stopping', { signal });
    this.healthServer?.close();
    await Promise.allSettled(
      [...this.sessions.values()].map((state) => this.release(state, 'program_audio_worker_shutdown')),
    );
    if (this.cacheDirectory) await rm(this.cacheDirectory, { recursive: true, force: true });
  }
}

const configuration = parseWorkerConfig(process.env);
const worker = new ProgrammeAudioWorker(configuration);
process.once('SIGTERM', () => { void worker.shutdown('sigterm'); });
process.once('SIGINT', () => { void worker.shutdown('sigint'); });
await worker.run();
