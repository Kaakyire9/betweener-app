// Controlled security session, not app runtime. Synthetic capture only.
const { chromium } = require('playwright');
const { SfuRequest, SfuEvent, JoinRequest, ClientDetails, TrackInfo, TrackType, VideoQuality, SetPublisherRequest, UpdateSubscriptionsRequest } = require('./connect-stream-sfu-protocol.cjs');

const probeFailure = (error, stage) => ({
  failure: /^sfu_[a-z0-9_]+$/.test(error.message) ? error.message : 'sfu_probe_unavailable',
  failedStage: stage,
  errorType: /^[A-Za-z]+Error$/.test(error.name) ? error.name : 'Error',
  localSourceLine: Number(/connect-stream-sfu-session\.cjs:(\d+):/.exec(error.stack ?? '')?.[1]) || undefined,
  answerRejected: /set remote answer sdp|setRemoteDescription/i.test(error.message),
  encodingRejected: /sendEncodings|scalabilityMode|setCodecPreferences/i.test(error.message),
});

const createSyntheticOffer = async ({ track, option, codecName, svc, rid }) => {
  const pc = window.auditPcs.publisher ??= new RTCPeerConnection();
  window.auditTrackTx ??= {}; window.auditPaintTimers ??= {};
  const audio = track === 'audio'; let media;
  if (audio && window.mediaTruth) {
    media = window.mediaTruth.track;
  } else if (audio) {
    const context = new AudioContext(); await context.resume();
    const destination = context.createMediaStreamDestination(); const oscillator = context.createOscillator();
    oscillator.connect(destination); oscillator.start(); media = destination.stream.getAudioTracks()[0];
  } else {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext('2d'); let frame = 0;
    const paint = () => { context.fillStyle = `hsl(${frame++ % 360},60%,40%)`; context.fillRect(0, 0, 640, 480); };
    paint(); window.auditPaintTimers[track] = setInterval(paint, 1000 / 30);
    media = canvas.captureStream(30).getVideoTracks()[0];
  }
  const tx = pc.addTransceiver(media, { direction: 'sendonly', streams: [new MediaStream([media])],
    sendEncodings: audio ? [{}] : [{ rid, maxBitrate: option?.bitrate ?? 500000, ...(svc ? { scalabilityMode: 'L1T3' } : {}) }] });
  const codecs = RTCRtpSender.getCapabilities(audio ? 'audio' : 'video').codecs;
  const selected = codecs.filter((codec) => codec.mimeType.toLowerCase() === `${audio ? 'audio' : 'video'}/${codecName}`);
  if (selected.length) tx.setCodecPreferences(selected);
  window.auditTrackTx[track] = tx;
  await pc.setLocalDescription(await pc.createOffer());
  await Promise.race([new Promise((resolve) => { pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); }; }), new Promise((resolve) => setTimeout(resolve, 1000))]);
  return { sdp: pc.localDescription.sdp, mid: tx.mid, trackId: media.id };
};

const rollbackSyntheticOffer = async (track) => {
  const pc = window.auditPcs.publisher;
  if (pc?.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' });
  const tx = window.auditTrackTx?.[track];
  if (tx) { tx.sender.track?.stop(); pc.removeTrack(tx.sender); tx.direction = 'inactive'; }
  clearInterval(window.auditPaintTimers?.[track]);
};

const answerSyntheticSubscriber = async (offer) => {
  const pc = window.auditPcs.sub;
  await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  // This raw fixture has no browser-to-SFU ICE trickle bridge. Include gathered
  // candidates in the answer, as the synthetic publisher already does.
  if (pc.iceGatheringState !== 'complete') await new Promise((resolve) => {
    const done = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', changed); resolve(); };
    const changed = () => { if (pc.iceGatheringState === 'complete') done(); };
    const timer = setTimeout(done, 1000); pc.addEventListener('icegatheringstatechange', changed);
  });
  return pc.localDescription.sdp;
};

async function openAuditSession(input) {
  let browser; let socket; let heartbeat;
  const result = { kind: 'SFU_PUBLISH_BOUNDARY', results: [], callEndedObserved: false };
  let stage = 'host_validation';
  const server = input.credentials.server;
  let page;
  const events = []; const operations = [];
  const now = () => ({ mono: performance.now(), utc: new Date().toISOString() });
  const record = (array, row) => { if (array.length < 2048) array.push(row); else result.telemetryTruncated = true; };
  const close = async () => {
    result.localClosedAt = now(); clearInterval(heartbeat); socket?.close();
    if (input.mediaTruth) await page?.evaluate(() => window.mediaTruth?.close()).catch(() => {});
    await browser?.close();
  };
  try {
    for (const target of [server.url, server.ws_endpoint]) {
      const url = new URL(target);
      if (!['https:', 'wss:'].includes(url.protocol) || !/\.(stream-io-video\.com|stream-io-video\.net|getstream\.io)$/.test(url.hostname)) throw new Error('sfu_unrecognized_host');
    }
    stage = 'browser_launch';
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      ...(input.mediaTruth ? { ignoreDefaultArgs: ['--mute-audio'] } : {}),
      args: ['--autoplay-policy=no-user-gesture-required'] });
    if (input.mediaTruth) result.runtime = { chrome: browser.version(), node: process.version, playwright: require('playwright/package.json').version };
    page = await browser.newPage();
    if (input.mediaTruth) await require('./connect-media-truth/browser.cjs').preparePage(page, input.mediaTruth.sender);
    const subscriberSdp = await page.evaluate(async () => {
      window.auditPcs = {};
      const sub = new RTCPeerConnection(); sub.addTransceiver('audio', { direction: 'recvonly' }); sub.addTransceiver('video', { direction: 'recvonly' });
      window.auditPcs.sub = sub;
      if (window.mediaTruth) sub.ontrack = (event) => window.mediaTruth.attach(new MediaStream([event.track]));
      return (await sub.createOffer()).sdp;
    });
    stage = 'sfu_join';
    const sessionId = crypto.randomUUID();
    result.sessionId = sessionId;
    const rpc = async (method, body) => {
      const started = now();
      const response = await fetch(`${server.url.replace(/\/$/, '')}/stream.video.sfu.signal.SignalServer/${method}`, {
        method: 'POST', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${input.credentials.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json(); record(operations, { method, started, completed: now(), status: response.status, code: payload.error?.code ?? payload.code ?? null });
      return { status: response.status, payload };
    };
    const url = new URL(server.ws_endpoint);
    for (const [key, value] of Object.entries({ api_key: input.key, user_id: input.userId, user_session_id: sessionId, cid: input.cid })) url.searchParams.set(key, value);
    socket = new WebSocket(url); socket.binaryType = 'arraybuffer';
    socket.addEventListener('close', (event) => record(events, { type: 'websocket-close', at: now(), code: event.code,
      reason: /^(|normal closure|call ended|session ended|client closed|going away|normal_closure|call_ended)$/i.test(event.reason) ? event.reason : '[redacted]',
      reasonSha256: require('node:crypto').createHash('sha256').update(event.reason).digest('hex'), clean: event.wasClean }));
    socket.addEventListener('error', () => { record(events, { type: 'websocket-error', at: now() }); result.socketError = true; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('sfu_open_timeout')), 8000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('sfu_open_failed')); }, { once: true });
    });
    let publishOptions = []; const pendingIce = []; let subscriberQueue = Promise.resolve();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('sfu_join_timeout')), 8000);
      socket.addEventListener('message', async (event) => {
        let message;
        try { message = SfuEvent.fromBinary(new Uint8Array(event.data)).eventPayload; }
        catch { result.eventDecodeFailed = true; return; }
        record(events, { type: message.oneofKind ?? 'unknown', at: now(),
          ...(message.oneofKind === 'error' ? { code: message.error.error?.code ?? null } : {}) });
        if (message.oneofKind === 'joinResponse') {
          clearTimeout(timer); publishOptions = message.joinResponse.publishOptions;
          result.joinAcknowledged = true;
          result.publishOptions = publishOptions.map(({ id, trackType, codec, videoDimension }) => ({ id, trackType, codec: codec?.name, videoDimension }));
          resolve();
        }
        if (message.oneofKind === 'error' && !result.joinAcknowledged) {
          clearTimeout(timer);
          const code = message.error.error?.code;
          result.joinErrorCode = Number.isInteger(code) ? code : null;
          reject(new Error(`sfu_join_error_${result.joinErrorCode ?? 'unknown'}`));
        }
        if (message.oneofKind === 'callEnded') {
          result.callEndedObserved = true; result.callEndedAt = Date.now();
          // Preserve the raw PC until stats are sampled: do not mistake local close for remote enforcement.
        }
        if (message.oneofKind === 'subscriberOffer') {
          subscriberQueue = subscriberQueue.then(async () => {
            const sdp = await page.evaluate(answerSyntheticSubscriber, message.subscriberOffer);
            const response = await rpc('SendAnswer', { sessionId, sdp, peerType: 'PEER_TYPE_SUBSCRIBER', negotiationId: message.subscriberOffer.negotiationId });
            result.subscriberAnswerStatus = response.status;
            for (const ice of pendingIce.filter((entry) => entry.peerType === 1)) {
              try { await page.evaluate((entry) => window.auditPcs.sub.addIceCandidate(JSON.parse(entry.iceCandidate)), ice); } catch { /* duplicate or obsolete candidate */ }
            }
          }).catch(() => { result.subscriberAnswerUnavailable = true; });
        }
        if (message.oneofKind === 'iceTrickle') {
          if (pendingIce.length >= 512) { result.telemetryTruncated = true; return; }
          pendingIce.push(message.iceTrickle);
          try { await page.evaluate(async (ice) => {
            const pc = ice.peerType === 1 ? window.auditPcs.sub : window.auditPcs.publisher;
            if (pc?.remoteDescription) await pc.addIceCandidate(JSON.parse(ice.iceCandidate));
          }, message.iceTrickle); } catch { /* candidates in answer remain available */ }
        }
      });
      socket.send(SfuRequest.toBinary(SfuRequest.create({ requestPayload: { oneofKind: 'joinRequest', joinRequest: JoinRequest.create({
        token: input.credentials.token, sessionId, unifiedSessionId: sessionId, subscriberSdp,
        clientDetails: ClientDetails.create({ sdk: { type: 9, major: '1', minor: '62', patch: '0' } }),
      }) } })));
    });
    heartbeat = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(SfuRequest.toBinary(SfuRequest.create({ requestPayload: { oneofKind: 'healthCheckRequest', healthCheckRequest: {} } })));
    }, 5000);
    const publishedTracks = [];
    const tracks = input.audioOnly ? [['audio', TrackType.AUDIO]] : [['video', TrackType.VIDEO], ['screenshare', TrackType.SCREEN_SHARE], ['audio', TrackType.AUDIO]];
    for (const [track, trackType] of tracks) {
      let published = false;
      try {
        stage = `${track}_offer`;
        const option = publishOptions.find((entry) => entry.trackType === trackType);
        const codecName = option?.codec?.name?.toLowerCase() ?? (track === 'audio' ? 'opus' : 'vp8');
        const svc = ['vp9', 'av1'].includes(codecName); const rid = svc ? 'q' : 'f';
        const offer = await page.evaluate(createSyntheticOffer, { track, option, codecName, svc, rid });
        stage = `${track}_publisher_request`;
        const info = TrackInfo.create({ trackType, mid: offer.mid, trackId: offer.trackId,
          publishOptionId: option?.id, codec: option?.codec,
          layers: trackType === TrackType.AUDIO ? [] : [{ rid, videoDimension: { width: 640, height: 480 }, bitrate: option?.bitrate ?? 500000, fps: 30,
            quality: svc ? VideoQuality.LOW_UNSPECIFIED : VideoQuality.HIGH }],
        });
        const req = SetPublisherRequest.create({ sessionId, sdp: offer.sdp, tracks: [...publishedTracks, info] });
        const { status, payload } = await rpc('SetPublisher', SetPublisherRequest.toJson(req));
        result.results.push({ track, status, code: payload.error?.code ?? payload.code ?? null, message: payload.error?.message ?? payload.msg ?? null,
          answerReceived: !!payload.sdp, optionMatched: !!option });
        if (payload.sdp && !payload.error) {
          stage = `${track}_remote_answer`;
          await page.evaluate(async (sdp) => { await window.auditPcs.publisher.setRemoteDescription({ type: 'answer', sdp }); }, payload.sdp);
          publishedTracks.push(info); published = true;
          for (const ice of pendingIce.filter((entry) => entry.peerType !== 1)) {
            try { await page.evaluate((entry) => window.auditPcs.publisher.addIceCandidate(JSON.parse(entry.iceCandidate)), ice); } catch { /* duplicate or obsolete candidate */ }
          }
          if (track === 'video') {
            stage = 'video_transport_stats';
            for (let attempt = 0; attempt < 24; attempt++) {
              result.videoStats = await page.evaluate(async () => {
                const pc = window.auditPcs.publisher; const rows = [...(await pc.getStats()).values()];
                const outbound = rows.find((row) => row.type === 'outbound-rtp' && row.kind === 'video');
                const remote = rows.find((row) => row.type === 'remote-inbound-rtp' && row.kind === 'video');
                return { connectionState: pc.connectionState, bytesSent: outbound?.bytesSent ?? 0, packetsSent: outbound?.packetsSent ?? 0,
                  framesEncoded: outbound?.framesEncoded ?? 0, remoteReportsReceived: remote?.reportsReceived ?? 0,
                  codec: rows.find((row) => row.id === outbound?.codecId)?.mimeType };
              });
              if (result.videoStats.bytesSent > 0 && result.videoStats.remoteReportsReceived > 0) break;
              await new Promise((resolve) => setTimeout(resolve, 250));
            }
          }
        }
      } catch (error) {
        result.results.push({ track, ...probeFailure(error, stage) });
        // A failed video attempt must not discard the audio control or its diagnostics.
      }
      if (!published) await page.evaluate(rollbackSyntheticOffer, track);
    }
    const stats = () => page.evaluate(async () => {
      const pc = window.auditPcs.publisher; let bytes = 0; let packets = 0;
      for (const row of (await pc.getStats()).values()) if (row.type === 'outbound-rtp' && row.kind === 'audio') { bytes += row.bytesSent ?? 0; packets += row.packetsSent ?? 0; }
      return { connectionState: pc.connectionState, bytesSent: bytes, packetsSent: packets };
    });
    stage = 'audio_transport_stats';
    for (let n = 0; n < 20; n++) {
      result.audioStats = await stats(); if (result.audioStats.bytesSent > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const receiveStats = () => page.evaluate(async () => {
      const pc = window.auditPcs.sub; let bytesReceived = 0; let packetsReceived = 0;
      for (const row of (await pc.getStats()).values()) if (row.type === 'inbound-rtp' && row.kind === 'audio') {
        bytesReceived += row.bytesReceived ?? 0; packetsReceived += row.packetsReceived ?? 0;
      }
      return { connectionState: pc.connectionState, bytesReceived, packetsReceived };
    });
    const subscribe = async ({ userId, sessionId: peerSession }) => {
      const request = UpdateSubscriptionsRequest.create({ sessionId, tracks: [{ userId, sessionId: peerSession, trackType: TrackType.AUDIO }] });
      const { status, payload } = await rpc('UpdateSubscriptions', UpdateSubscriptionsRequest.toJson(request));
      return { status, code: payload.error?.code ?? payload.code ?? null };
    };
    return { result, subscribe,
      transmit: async (target) => {
        if (!input.mediaTruth || target.sender !== input.mediaTruth.sender) throw new Error('sfu_truth_scope_invalid');
        return await page.evaluate((value) => window.mediaTruth.transmit(value), target);
      },
      stats: async () => ({ ...await stats(), receivedAudio: await receiveStats(),
        callEndedObserved: result.callEndedObserved, callEndedAt: result.callEndedAt,
        ...(input.mediaTruth ? { detail: await page.evaluate(require('./connect-media-truth/browser.cjs').collectStats),
          events, operations, telemetryTruncated: !!result.telemetryTruncated, eventDecodeFailed: !!result.eventDecodeFailed,
          socketError: !!result.socketError, subscriberAnswerUnavailable: !!result.subscriberAnswerUnavailable } : {}) }), close };
  } catch (error) {
    await close();
    // Keep partial signaling observations; never include exception text, SDP, URLs or credentials.
    Object.assign(result, probeFailure(error, stage));
    throw Object.assign(new Error(result.failure), { auditResult: result });
  }
}
module.exports = { openAuditSession, createSyntheticOffer, rollbackSyntheticOffer, answerSyntheticSubscriber };
