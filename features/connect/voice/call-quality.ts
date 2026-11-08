type Event = 'credentials' | 'native_join' | 'microphone' | 'audio_output' | 'ready' | 'received_rtp' | 'receiver_growth' | 'end_requested' | 'sdk_released' | 'authority_terminal';
/** Fixed-size, in-memory timing evidence. All events use this process's clock. */
export function createCallQualityTracker() {
  const events = new Map<Event, number>();
  const between = (start: Event, end: Event) => {
    const a = events.get(start), b = events.get(end);
    return a === undefined || b === undefined || b < a ? null : Math.round(b - a);
  };
  return {
    mark(event: Event, now: number) { if (Number.isFinite(now) && !events.has(event)) events.set(event, now); },
    snapshot() {
      return { credentialsMs: between('credentials', 'native_join'), nativeJoinMs: between('native_join', 'microphone'),
        microphoneEnableMs: between('microphone', 'audio_output'), outputSelectionMs: between('audio_output', 'ready'),
        setupMs: between('credentials', 'ready'), firstReceivedPacketMs: between('credentials', 'received_rtp'),
        firstReceiverGrowthMs: between('credentials', 'receiver_growth'),
        sdkReleaseMs: between('end_requested', 'sdk_released'), authorityEndMs: between('end_requested', 'authority_terminal'),
        physicalShutdown: 'not_verified' as const, providerMediaTermination: 'not_verified' as const };
    },
  };
}
export type CallQuality = ReturnType<ReturnType<typeof createCallQualityTracker>['snapshot']>;
