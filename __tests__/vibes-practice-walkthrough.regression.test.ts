// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const readSource = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');

const walkthrough = readSource('components/vibes/VibesPracticeWalkthrough.tsx');
const practiceStore = readSource('lib/offline/vibes-practice-store.ts');
const vibesScreen = readSource('app/(tabs)/_vibes.tsx');

test('practice teaches Pass as private deck shaping instead of an unexplained rejection', () => {
  assert.match(walkthrough, /They will not be notified/);
  assert.match(walkthrough, /move them out of your deck for now/);
  assert.match(walkthrough, /A Pass helps shape your deck/);
});

test('practice requires Intent, Notice, Pass, and Undo actions', () => {
  assert.match(walkthrough, /Step 1 of 4/);
  assert.match(walkthrough, /Step 4 of 4/);
  assert.match(walkthrough, /if \(step !== "intentForm" \|\| !hasPickedIntentOption\) return/);
  assert.match(walkthrough, /onUndo=\{completeUndo\}/);
  assert.match(walkthrough, /step === "undoPrompt"/);
});

test('new Undo steps can resume safely from offline practice state', () => {
  assert.match(practiceStore, /\| "undoPrompt"/);
  assert.match(practiceStore, /\| "undoExplain"/);
  assert.match(practiceStore, /value === "undoPrompt"/);
  assert.match(practiceStore, /value === "undoExplain"/);
});

test('practice respects reduced motion and announces lesson changes', () => {
  assert.match(walkthrough, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(walkthrough, /reduceMotionChanged/);
  assert.match(walkthrough, /AccessibilityInfo\.announceForAccessibility/);
});

test('the Vibes header exposes an understandable replay control', () => {
  assert.match(vibesScreen, /accessibilityLabel="Practice Vibes actions"/);
  assert.match(vibesScreen, /interactive Intent, Notice, Pass, and Undo walkthrough/);
  assert.match(vibesScreen, /onPracticeEvent=\{handlePracticeEvent\}/);
});
