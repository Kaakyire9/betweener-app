const test = require('node:test');
const assert = require('node:assert/strict');
const { voicePeerPhotos } = require('../features/connect/voice/peer-gallery.ts');
test('published gallery uses the avatar first, deduplicates and caps work at six images', () => {
  assert.deepEqual(voicePeerPhotos('https://example.com/a', ['https://example.com/a', ' https://example.com/b ']), ['https://example.com/a', 'https://example.com/b']);
  const result = voicePeerPhotos('https://example.com/avatar', Array.from({length: 20}, (_, i) => `https://example.com/${i}`));
  assert.equal(result.length, 6); assert.equal(result[0], 'https://example.com/avatar');
});
test('gallery rejects local files, credentials, malformed values and non HTTPS URLs', () => {
  assert.deepEqual(voicePeerPhotos(null, ['file:///private.jpg', 'content://gallery/1', 'http://example.com/a', 'https://user:password@example.com/b', 'data:image/png;base64,abcd', {}, null, 'invalid']), []);
  assert.deepEqual(voicePeerPhotos(undefined, 'not an array'), []);
  assert.deepEqual(voicePeerPhotos('', ['https://example.com/gallery']), ['https://example.com/gallery']);
});
