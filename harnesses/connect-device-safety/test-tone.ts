/** One second, mono 16-bit PCM WAV, 440Hz at 8% amplitude. No downloaded assets. */
export function createTestTone() {
  const rate = 16000;
  const buffer = new ArrayBuffer(44 + rate * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, rate * 2, true);
  for (let i = 0; i < rate; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 2621), true);
  return new Uint8Array(buffer);
}
