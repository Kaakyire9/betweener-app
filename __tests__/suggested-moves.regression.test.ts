import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeSuggestedMovesWithProfiles } from '../lib/intents/suggested-moves.ts';

test('suggested moves fall back to the first usable gallery photo', () => {
  const [move] = mergeSuggestedMovesWithProfiles(
    [{ id: 'profile-1', full_name: 'Old name', avatar_url: null }],
    [{
      id: 'profile-1',
      full_name: 'Ama',
      age: 31,
      avatar_url: null,
      photos: ['', 'https://cdn.example.com/ama.jpg'],
    }],
  );

  assert.equal(move.avatar_url, 'https://cdn.example.com/ama.jpg');
  assert.equal(move.full_name, 'Ama');
  assert.equal(move.age, 31);
});

test('suggested moves omit profiles that have left Betweener', () => {
  const moves = mergeSuggestedMovesWithProfiles(
    [{ id: 'profile-1', full_name: 'Ama', avatar_url: null }],
    [{ id: 'profile-1', full_name: 'Ama', account_state: 'deleted' }],
  );

  assert.deepEqual(moves, []);
});
