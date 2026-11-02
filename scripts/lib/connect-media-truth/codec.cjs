// Browser-serializable, blind 16-FSK decoder. No expected nonce enters this module.
function createCodec() {
  const symbolSeconds = 0.08;
  const frameBytes = 25;
  const frequencies = Array.from({ length: 16 }, (_, n) => 600 + n * 100);
  function crc(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let n = 0; n < 8; n++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  }
  function frame({ nonce, phase, sender }) {
    if (!/^[0-9a-f]{32}$/.test(nonce) || ![0, 1, 2].includes(phase) || ![1, 2].includes(sender)) throw new Error('invalid_frame');
    const bytes = Uint8Array.from([0xd3, 0x91, 1, phase, sender, ...nonce.match(/../g).map((x) => parseInt(x, 16)), 0, 0, 0, 0]);
    new DataView(bytes.buffer).setUint32(21, crc(bytes.slice(0, 21)));
    return bytes;
  }
  function encode(input, rate = 48000) {
    const bytes = frame(input); const size = Math.round(rate * symbolSeconds);
    const pcm = new Float32Array(size * frameBytes * 2 + Math.round(rate * 0.16));
    for (let b = 0; b < frameBytes * 2; b++) {
      const frequency = frequencies[(bytes[b >> 1] >> (4 - (b % 2) * 4)) & 15];
      for (let n = 0; n < size; n++) pcm[b * size + n] = 0.25 * Math.sin(2 * Math.PI * frequency * n / rate);
    }
    return pcm;
  }
  function decoder(rate = 48000) {
    const size = Math.round(rate * symbolSeconds);
    const lanes = Array.from({ length: 5 }, (_, n) => ({ cursor: Math.round(n * size / 5), bits: [], confidence: [] }));
    let buffer = []; let base = 0; let total = 0; let lastStart = -Infinity;
    const diagnostics = { crcValid: 0, crcValidByPhase: [0, 0, 0], belowConfidence: 0, maximumMinimumConfidence: 0, maximumMeanConfidence: 0, rejectedFrames: [] };
    const power = (values, start, end, hz) => {
      const coefficient = 2 * Math.cos(2 * Math.PI * hz / rate); let a = 0; let b = 0;
      for (let n = start; n < end; n++) { const x = values[n] + coefficient * a - b; b = a; a = x; }
      return a * a + b * b - coefficient * a * b;
    };
    return {
      push(pcm) {
        // Never retain a whole recording. Only the current symbol and 50 decoded symbols per lane.
        buffer.push(...pcm); total += pcm.length; const found = [];
        for (const lane of lanes) {
          while (lane.cursor + size <= base + buffer.length) {
            const start = lane.cursor - base + Math.round(size * 0.2); const end = lane.cursor - base + Math.round(size * 0.8);
            const powers = frequencies.map((hz) => power(buffer, start, end, hz)); const maximum = Math.max(...powers);
            const confidence = maximum / (powers.reduce((sum, p) => sum + p, 0) + 1e-12);
            lane.bits.push(powers.indexOf(maximum)); lane.confidence.push(maximum > 0.01 ? confidence : 0);
            if (lane.bits.length > 50) { lane.bits.shift(); lane.confidence.shift(); }
            lane.cursor += size;
            if (lane.bits.length !== 50) continue;
            const bytes = Uint8Array.from({ length: frameBytes }, (_, i) => lane.bits.slice(i * 2, i * 2 + 2).reduce((v, symbol) => (v << 4) | symbol, 0));
            if (bytes[0] !== 0xd3 || bytes[1] !== 0x91 || bytes[2] !== 1 || bytes[3] > 2 || ![1, 2].includes(bytes[4])) continue;
            if (new DataView(bytes.buffer).getUint32(21) !== crc(bytes.slice(0, 21))) {
              diagnostics.rejectedFrames.push([...bytes]); if (diagnostics.rejectedFrames.length > 8) diagnostics.rejectedFrames.shift(); continue;
            }
            const minimumConfidence = Math.min(...lane.confidence);
            const meanConfidence = lane.confidence.reduce((sum, c) => sum + c, 0) / 50;
            diagnostics.crcValid++; diagnostics.crcValidByPhase[bytes[3]]++; diagnostics.maximumMinimumConfidence = Math.max(diagnostics.maximumMinimumConfidence, minimumConfidence);
            diagnostics.maximumMeanConfidence = Math.max(diagnostics.maximumMeanConfidence, meanConfidence);
            const qualified = minimumConfidence >= 0.75 && meanConfidence >= 0.97;
            if (!qualified) diagnostics.belowConfidence++;
            const startSample = lane.cursor - 50 * size;
            if (Math.abs(startSample - lastStart) < size) continue;
            if (qualified) lastStart = startSample;
            found.push({ nonce: [...bytes.slice(5, 21)].map((v) => v.toString(16).padStart(2, '0')).join(''), phase: bytes[3], sender: bytes[4],
              confidence: meanConfidence, minimumSymbolConfidence: minimumConfidence, crcValid: true, sampleRate: rate, startSample, endSample: lane.cursor });
          }
        }
        const discard = Math.min(...lanes.map((lane) => lane.cursor)) - base;
        buffer = buffer.slice(discard); base += discard;
        return found;
      },
      get samples() { return total; },
      get diagnostics() { return { ...diagnostics }; },
    };
  }
  return { encode, decoder, frameSeconds: 4, loopSeconds: 4.16, controlNonce: '00000000000000000000000000000000' };
}
module.exports = { createCodec };
