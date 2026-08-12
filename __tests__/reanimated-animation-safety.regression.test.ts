// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('vibes animations do not replace a shared value from its own completion callback', () => {
  const sources = [
    readSource('components/ExploreStack.reanimated.tsx'),
    readSource('components/ExploreStack.tsx'),
    readSource('components/vibes/depth/VibesActionDock.tsx'),
  ];
  const selfReplacingAnimation = /(\w+)\.value\s*=\s*with(?:Timing|Spring)\([\s\S]*?\(\)\s*=>\s*\{\s*\1\.value\s*=\s*with(?:Timing|Spring)/;

  for (const source of sources) {
    assert.doesNotMatch(source, selfReplacingAnimation);
  }
});
