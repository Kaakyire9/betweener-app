import assert from 'node:assert/strict';
import test from 'node:test';
import { withAlpha } from '../lib/chat/ui/color-utils.ts';

test('supports short hex and clamps alpha for chat surface colors', () => {
  assert.equal(withAlpha('#0af', 1.5), 'rgba(0,170,255,1)');
  assert.equal(withAlpha('#123456', -1), 'rgba(18,52,86,0)');
});
