import type { NativeCallActivationFailure, NativeCallActivationStatus, NativeDisconnectCause } from './native-owner-types.ts';

export const CONNECT_NATIVE_ACTIVATION_TIMEOUT_MS = 3_000;

interface ActivationPort {
  readonly isSetup: boolean;
  readonly isOngoingCallsEnabled: boolean;
  isCallTracked(cid: string): boolean;
  setCurrentCallActive(cid: string): Promise<void>;
  addEventListener(event: 'didToggleHoldCallAction', listener: (event: { callId: string; hold: boolean }) => void): { remove(): void };
}

export function nativeDisconnectCause(value: unknown): NativeDisconnectCause {
  return typeof value === 'string' && ['local', 'remote', 'rejected', 'busy', 'answeredElsewhere', 'missed', 'error'].includes(value)
    ? value as NativeDisconnectCause : 'unknown';
}

/** Activates only an already registered, joined Android call. A missing native
 * registration may keep an explicitly foreground call on the SDK audio path.
 * It does not confirm Telecom activation or permit background continuation.
 * No registration, Answer, capture, or background lease is acquired here. A bridge acknowledgement
 * alone does not establish that Telecom transitioned the call to active. */
export function createNativeCallActivation(input: {
  cid: string; platform: 'ios' | 'android'; port(): ActivationPort;
  current(): boolean; joined(): boolean; foreground?(): boolean; onChange?(): void;
}) {
  let retired = false, status: NativeCallActivationStatus = 'not_started';
  let failure: NativeCallActivationFailure | null = null;
  let operation: { promise: Promise<void>; cancel(): void } | null = null;
  const update = (next: NativeCallActivationStatus, reason: NativeCallActivationFailure | null = null) => {
    status = next; failure = reason;
    try { input.onChange?.(); } catch { /* Inspection must not control activation. */ }
  };
  const current = () => !retired && input.current() && input.joined();
  return {
    status: () => status,
    failure: () => failure,
    activate(): Promise<void> {
      if (!current()) return Promise.reject(Error('connect_native_owner_retired'));
      if (operation) return operation.promise;
      if (status === 'confirmed') return Promise.resolve();
      let port: ActivationPort;
      let preflightFailure: NativeCallActivationFailure = 'native_api_failed';
      try {
        if (!/^betweener_connect:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.cid)) {
          preflightFailure = 'invalid_call'; throw Error('invalid_call');
        }
        if (input.platform !== 'android') { update('not_applicable'); return Promise.resolve(); }
        port = input.port();
        if (!port.isSetup || !port.isOngoingCallsEnabled) { update('not_applicable'); return Promise.resolve(); }
        if (!port.isCallTracked(input.cid)) {
          if (input.foreground?.() === true && current()) {
            update('foreground_only', 'registration_missing'); return Promise.resolve();
          }
          preflightFailure = 'registration_missing'; throw Error('missing_registration');
        }
      } catch { update('failed', preflightFailure); return Promise.reject(Error('connect_native_call_activation_failed')); }

      let resolve!: () => void, reject!: (error: Error) => void;
      const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      let finished = false, acknowledged = false, activeEvent = false;
      let subscription: { remove(): void } | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: Error, reason: NativeCallActivationFailure = 'native_api_failed') => {
        if (finished) return;
        finished = true; clearTimeout(timer);
        try { subscription?.remove(); } catch { /* A failed observer cannot retain setup. */ }
        operation = null;
        update(error ? retired ? 'cancelled' : 'failed' : 'confirmed', error ? retired ? 'owner_retired' : reason : null);
        if (error) reject(error); else resolve();
      };
      const confirm = () => {
        if (finished) return;
        try {
          if (!current()) { finish(Error('connect_native_call_activation_failed'), 'owner_retired'); return; }
          if (!port.isCallTracked(input.cid)) { finish(Error('connect_native_call_activation_failed'), 'registration_lost'); return; }
          if (acknowledged && activeEvent) finish();
        } catch { finish(Error('connect_native_call_activation_failed')); }
      };
      operation = { promise, cancel: () => finish(Error('connect_native_owner_retired'), 'owner_retired') };
      update('pending');
      let requestStarted = false;
      try {
        if (finished) return promise;
        timer = setTimeout(() => finish(Error('connect_native_call_activation_timeout'), acknowledged ? 'active_event_timeout' : 'ack_timeout'), CONNECT_NATIVE_ACTIVATION_TIMEOUT_MS);
        subscription = port.addEventListener('didToggleHoldCallAction', event => {
          if (event.callId !== input.cid || event.hold !== false) return;
          activeEvent = true; confirm();
        });
        if (finished) { subscription.remove(); return promise; }
        if (!current()) { finish(Error('connect_native_call_activation_failed'), 'owner_retired'); return promise; }
        requestStarted = true;
        Promise.resolve(port.setCurrentCallActive(input.cid)).then(() => {
          acknowledged = true; confirm();
        }, () => finish(Error('connect_native_call_activation_failed'), 'activation_request_failed'));
      } catch { finish(Error('connect_native_call_activation_failed'), requestStarted ? 'activation_request_failed' : 'event_subscription_failed'); }
      return promise;
    },
    dispose() { retired = true; operation?.cancel(); },
  };
}
