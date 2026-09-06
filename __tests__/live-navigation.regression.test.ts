import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCircleLiveReturnParams,
  getLiveExitDestination,
  getLiveReturnParams,
} from '../features/live/navigation/live-navigation.ts';
import { streamLiveSdkLogSink } from '../features/live/media/stream-live-media-provider.ts';

test('Circle-backed Live rooms return to the exact Circle surface', () => {
  const returnParams = createCircleLiveReturnParams('circle-1', 'pulse');

  assert.deepEqual(getLiveExitDestination(returnParams), {
    pathname: '/circles/[id]',
    params: { id: 'circle-1', tab: 'pulse' },
  });
});

test('global Live rooms return to the Live Studio', () => {
  assert.equal(getLiveExitDestination(null), '/live');
  assert.equal(getLiveExitDestination({ returnCircleId: '  ' }), '/live');
});

test('Live return params reject unknown Circle sections and preserve array route params', () => {
  assert.deepEqual(getLiveReturnParams({
    returnCircleId: ['circle-2'],
    returnCircleTab: ['unknown'],
  }), {
    returnCircleId: 'circle-2',
    returnCircleTab: 'live',
  });
});

test('expected Stream coordinator closes are handled by the owned SDK sink', () => {
  assert.doesNotThrow(() => streamLiveSdkLogSink(
    'warn',
    '[coordinator]: connection:WS failed with code: 1006: 1006 and reason:',
  ));
  assert.doesNotThrow(() => streamLiveSdkLogSink(
    'warn',
    '[coordinator]: connection:WS failed with code: 1001: Stream end encountered',
  ));
});

test('transient signaling failures are delegated to transport recovery without LogBox errors', () => {
  const originalWarn = console.warn;
  let warningCount = 0;
  console.warn = () => { warningCount += 1; };
  try {
    streamLiveSdkLogSink('error', '[SfuClientWS](0): Signaling WS channel error');
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warningCount, 0);
});
