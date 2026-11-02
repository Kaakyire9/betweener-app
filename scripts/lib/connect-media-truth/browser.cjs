const { createCodec } = require('./codec.cjs');

// Serialized into the isolated diagnostic page. No microphone APIs or expected remote challenge.
async function installAudio({ sender }) {
  const codec = window.MediaTruthCodec;
  const context = new AudioContext({ sampleRate: 48000 }); await context.resume();
  if (!context.audioWorklet || context.state !== 'running') throw new Error('audio_worklet_unavailable');
  const moduleUrl = URL.createObjectURL(new Blob([`
    class PCM extends AudioWorkletProcessor {
      constructor() { super(); this.parts = []; this.count = 0; }
      process(inputs) {
        const audio = inputs[0]?.[0];
        if (audio) {
          this.parts.push(new Float32Array(audio)); this.count += audio.length;
          if (this.count >= 2048) {
            const pcm = new Float32Array(this.count); let offset = 0;
            for (const part of this.parts) { pcm.set(part, offset); offset += part.length; }
            this.port.postMessage({ pcm, frame: currentFrame, rate: sampleRate }, [pcm.buffer]);
            this.parts = []; this.count = 0;
          }
        }
        return true;
      }
    }
    registerProcessor('media-truth-pcm', PCM);
  `], { type: 'text/javascript' }));
  await context.audioWorklet.addModule(moduleUrl); URL.revokeObjectURL(moduleUrl);
  const destination = context.createMediaStreamDestination(); const receivers = []; const transmissions = [];
  let source; const sourceMeter = context.createAnalyser(); sourceMeter.fftSize = 2048;
  const clock = () => ({ mono: performance.now(), utc: new Date().toISOString(), timeOrigin: performance.timeOrigin, audioSeconds: context.currentTime });
  async function transmit(input) {
    if (input.sender !== sender) throw new Error('sender_mismatch');
    const pcm = codec.encode(input, context.sampleRate);
    const buffer = context.createBuffer(1, pcm.length, context.sampleRate); buffer.copyToChannel(pcm, 0);
    const next = context.createBufferSource(); next.buffer = buffer; next.loop = true; next.connect(destination); next.connect(sourceMeter);
    const before = clock(); const scheduledAudioSeconds = context.currentTime + 0.1;
    source?.stop(scheduledAudioSeconds); next.start(scheduledAudioSeconds); source = next;
    const deadline = performance.now() + 2000;
    while (context.currentTime < scheduledAudioSeconds) {
      if (performance.now() > deadline) throw new Error('audio_clock_stalled');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const receipt = { nonce: input.nonce, phase: input.phase, sender, before, scheduledAudioSeconds, renderClockPassed: clock(),
      meaning: 'Scheduled synthetic source; render clock passed start. Not a packet transmission timestamp.' };
    transmissions.push(receipt); return receipt;
  }
  function attach(stream) {
    for (const track of stream.getAudioTracks()) {
      if (receivers.some((r) => r.trackId === track.id)) continue;
      const decode = codec.decoder(context.sampleRate);
      const receiver = { receiver: sender, trackId: track.id, frames: [], chunks: 0, samples: 0, lastChunk: null, error: null, peak: 0 };
      // Chrome's WebRTC playout path must be running for remote PCM analysis.
      const element = document.createElement('audio'); element.srcObject = new MediaStream([track]);
      element.autoplay = false; document.body.appendChild(element);
      const node = new AudioWorkletNode(context, 'media-truth-pcm');
      const mute = context.createGain(); mute.gain.value = 0;
      // The worklet emits silence. A zero gain output also prevents audible playback.
      // Reroute the element before play: the only output is worklet silence through zero gain.
      const elementOutput = context.createMediaElementSource(element); elementOutput.connect(mute);
      const remote = context.createMediaStreamSource(new MediaStream([track])); remote.connect(node); node.connect(mute); mute.connect(context.destination);
      element.play().catch(() => { receiver.error = 'remote_playout_unavailable'; });
      node.onprocessorerror = () => { receiver.error = 'worklet_processor_error'; };
      node.port.onmessage = ({ data }) => {
        try {
          const at = clock(); const frames = decode.push(data.pcm);
          receiver.chunks++; receiver.samples = decode.samples; receiver.lastChunk = at;
          receiver.diagnostics = decode.diagnostics;
          receiver.peak = Math.max(receiver.peak, ...data.pcm.map(Math.abs));
          for (const frame of frames) {
            if (receiver.frames.length >= 256) throw new Error('decoder_frame_limit');
            receiver.frames.push({ ...frame, observed: at, audioWorkletFrame: data.frame, sampleRate: data.rate });
          }
        } catch { receiver.error = 'decoder_failed'; }
      };
      receivers.push(receiver);
    }
  }
  window.mediaTruth = { sender, track: destination.stream.getAudioTracks()[0], attach, transmit,
    snapshot: () => { const levels = new Float32Array(2048); sourceMeter.getFloatTimeDomainData(levels);
      return { sender, clock: clock(), contextState: context.state, sourcePeak: Math.max(...levels.map(Math.abs)), receivers, transmissions }; },
    close: async () => { source?.stop(); destination.stream.getTracks().forEach((t) => t.stop()); await context.close(); },
  };
  await transmit({ nonce: codec.controlNonce, phase: 0, sender });
}

async function preparePage(page, sender) {
  // Playwright fulfils this loopback URL in-process; no HTTP server/provider is contacted.
  await page.route('http://localhost/media-truth', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic media diagnostic</title>' }));
  await page.goto('http://localhost/media-truth');
  await page.addScriptTag({ content: `window.MediaTruthCodec = (${createCodec.toString()})();` });
  await page.evaluate(installAudio, { sender });
}

// Serialized browser collector. Only an explicit allowlist leaves the page.
async function collectStats() {
  const pcs = window.auditPcs; const output = {};
  for (const [name, pc] of Object.entries(pcs)) {
    const rows = [...(await pc.getStats()).values()];
    output[name] = { connectionState: pc.connectionState, iceConnectionState: pc.iceConnectionState,
      iceGatheringState: pc.iceGatheringState, signalingState: pc.signalingState,
      rtp: rows.filter((r) => ['inbound-rtp', 'outbound-rtp'].includes(r.type) && r.kind === 'audio').map((r) => ({
        id: r.id, type: r.type, ssrc: r.ssrc, trackIdentifier: r.trackIdentifier ?? rows.find((source) => source.id === r.mediaSourceId)?.trackIdentifier ?? null, timestamp: r.timestamp,
        lastPacketReceivedTimestamp: r.lastPacketReceivedTimestamp ?? null, bytesReceived: r.bytesReceived ?? null,
        packetsReceived: r.packetsReceived ?? null, bytesSent: r.bytesSent ?? null, packetsSent: r.packetsSent ?? null,
        jitterBufferDelay: r.jitterBufferDelay ?? null, jitterBufferEmittedCount: r.jitterBufferEmittedCount ?? null,
        audioLevel: r.audioLevel ?? null, totalAudioEnergy: r.totalAudioEnergy ?? null,
        totalSamplesReceived: r.totalSamplesReceived ?? null, concealedSamples: r.concealedSamples ?? null,
      })),
      transports: rows.filter((r) => r.type === 'transport').map((r) => ({ id: r.id, timestamp: r.timestamp,
        dtlsState: r.dtlsState ?? null, iceState: r.iceState ?? null, selectedCandidatePairId: r.selectedCandidatePairId ?? null })),
    };
  }
  return { peers: output, audio: window.mediaTruth.snapshot() };
}
module.exports = { preparePage, installAudio, collectStats };
