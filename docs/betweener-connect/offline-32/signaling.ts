import { Facts, PROFILE, list, object, stamp } from './contract.ts';
import type { Context, RecordValue, Stamp } from './contract.ts';

type Event = { type: string; at: Stamp; code?: number; clean?: boolean };
export function inspectSignaling(samples: RecordValue[], c: Context, f: Facts) {
  if (c.authenticatedSessionPath !== true) f.add('sfuEvent', 'MISSING', 'AUTHENTICATED_SESSION_PROVENANCE_MISSING');
  const peers = [0, 1].map(i => {
    const history = new Map<string, string>(); let previousSequence: string[] = [];
    let selected: Event[] = []; let firstEndCapture: unknown = null; let preExisting = false;
    const series = [object(c.baseline), ...samples];
    series.forEach((snapshot, index) => {
      if (!Array.isArray(snapshot.signaling) || snapshot.signaling.length !== 2) f.add('sfuEvent', snapshot.signaling === undefined ? 'MISSING' : 'INVALID', 'SIGNALING_PAIR_MISSING_OR_INVALID', i + 1, index - 1);
      const signal = object(list(snapshot.signaling, 2)[i]);
      if (!Array.isArray(signal.events)) { f.add('sfuEvent', signal.events === undefined ? 'MISSING' : 'INVALID', 'EVENT_ARRAY_MISSING', i + 1, index - 1); return; }
      if (signal.events.length > PROFILE.maximumEvents) { f.add('sfuEvent', 'INVALID', 'EVENT_LIMIT_EXCEEDED', i + 1); return; }
      const focused: Event[] = []; const sequence: string[] = []; const seen = new Set<string>();
      let previousMono = -Infinity; let previousUtc = -Infinity;
      for (const raw of signal.events) {
        const e = object(raw);
        if (typeof e.type !== 'string' || !stamp(e.at)) { f.add('sfuEvent', 'INVALID', 'EVENT_STAMP_OR_TYPE_INVALID', i + 1); continue; }
        if (e.at.mono < previousMono || Date.parse(e.at.utc) < previousUtc) f.add('sfuEvent', 'INVALID', 'EVENT_CLOCK_ORDER_INVALID', i + 1);
        previousMono = e.at.mono; previousUtc = Date.parse(e.at.utc);
        if (!['joinResponse', 'callEnded', 'websocket-close'].includes(e.type)) continue;
        const event: Event = { type: e.type, at: e.at,
          ...(e.type === 'websocket-close' ? { code: typeof e.code === 'number' ? e.code : -1, clean: e.clean === true } : {}) };
        const key = `${e.type}:${e.at.mono}`; const canonical = JSON.stringify(event);
        if (seen.has(key)) f.add('sfuEvent', 'INVALID', 'DUPLICATE_EVENT_OBSERVATION', i + 1);
        if (history.has(key) && history.get(key) !== canonical) f.add('sfuEvent', 'INVALID', 'EVENT_OBSERVATION_CONTRADICTED', i + 1);
        history.set(key, canonical); seen.add(key); sequence.push(key); focused.push(event);
      }
      if (previousSequence.some((key, n) => sequence[n] !== key)) f.add('sfuEvent', 'INVALID', 'CUMULATIVE_EVENT_HISTORY_REGRESSED', i + 1);
      previousSequence = sequence; selected = focused;
      const end = focused.filter(e => e.type === 'callEnded');
      if (typeof signal.callEndedObserved === 'boolean' && signal.callEndedObserved !== (end.length > 0)) f.add('sfuEvent', 'INVALID', 'EVENT_FLAG_CONTRADICTS_HISTORY', i + 1);
      if (end.length && firstEndCapture === null) { firstEndCapture = snapshot.completed ?? null; preExisting = index === 0; }
    });
    const joins = selected.filter(e => e.type === 'joinResponse'); const ends = selected.filter(e => e.type === 'callEnded');
    const closes = selected.filter(e => e.type === 'websocket-close');
    if (joins.length !== 1) f.add('sfuEvent', joins.length ? 'INVALID' : 'MISSING', joins.length ? 'JOIN_ACK_AMBIGUOUS' : 'JOIN_ACK_MISSING', i + 1);
    if (ends.length > 1) f.add('sfuEvent', 'INVALID', 'END_EVENT_AMBIGUOUS', i + 1);
    if (ends.length === 0) f.add('sfuEvent', 'MISSING', 'END_EVENT_NOT_OBSERVED', i + 1);
    if (closes.length > 1) f.add('sfuEvent', 'INVALID', 'SOCKET_CLOSE_AMBIGUOUS', i + 1);
    const join = joins[0]; const end = ends[0]; const close = closes[0];
    if (end && join && (end.at.mono < join.at.mono || selected.indexOf(end) < selected.indexOf(join))) f.add('sfuEvent', 'INVALID', 'END_EVENT_PRECEDES_JOIN', i + 1);
    if (close && end && (close.at.mono < end.at.mono || selected.indexOf(close) < selected.indexOf(end))) f.add('sfuEvent', 'INVALID', 'SOCKET_CLOSE_PRECEDES_END', i + 1);
    return { receiver: i + 1, rawSessionId: c.participants?.[i]?.rawSessionId ?? null, join: join ?? null, end: end ?? null,
      close: close ?? null, preExistingAtBaseline: preExisting, firstParentCapture: firstEndCapture,
      cleanClose: close?.code === 1000 && close.clean === true };
  });
  const corroborated = f.valid('identity', 'sfuEvent') && peers.every(p => p.join && p.end);
  return { peers, corroborated, cleanClosures: corroborated && peers.every(p => p.cleanClose),
    association: peers.some(p => p.preExistingAtBaseline) ? 'PRE_EXISTING_AT_BASELINE' : 'FIRST_OBSERVED_AFTER_BASELINE' };
}
