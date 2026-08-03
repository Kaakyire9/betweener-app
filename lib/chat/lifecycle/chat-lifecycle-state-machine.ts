export type ChatLifecycleMachine =
  | 'outgoing_message'
  | 'outgoing_attachment'
  | 'incoming_cache'
  | 'view_once'
  | 'album';

export type OutgoingMessageState =
  | 'queued' | 'sending' | 'sent' | 'delivered' | 'read'
  | 'retryable_failed' | 'terminal_failed' | 'cancelled' | 'deleted';
export type OutgoingAttachmentState =
  | 'queued' | 'preparing' | 'uploading' | 'paused' | 'finalizing' | 'sent'
  | 'retryable_failed' | 'terminal_failed' | 'missing_local_file' | 'cancelled' | 'deleted';
export type IncomingCacheState =
  | 'remote_only' | 'downloading' | 'available_offline'
  | 'retryable_failed' | 'terminal_failed' | 'missing_local_file' | 'deleted';
export type ViewOnceLifecycleState =
  | 'available' | 'opening' | 'consumed' | 'expired' | 'deleted';
export type AlbumLifecycleState =
  | 'queued' | 'preparing' | 'uploading' | 'finalizing' | 'sent'
  | 'retryable_failed' | 'terminal_failed' | 'cancelled' | 'deleted';

export type ChatLifecycleStateByMachine = {
  outgoing_message: OutgoingMessageState;
  outgoing_attachment: OutgoingAttachmentState;
  incoming_cache: IncomingCacheState;
  view_once: ViewOnceLifecycleState;
  album: AlbumLifecycleState;
};

export type ChatLifecycleEvent =
  | 'enqueue' | 'prepare_started' | 'send_started' | 'upload_started'
  | 'upload_paused' | 'upload_completed' | 'finalize_succeeded'
  | 'delivery_confirmed' | 'read_confirmed' | 'retryable_failure'
  | 'terminal_failure' | 'source_missing' | 'retry_requested'
  | 'cancel_requested' | 'delete_requested' | 'download_started'
  | 'download_succeeded' | 'local_file_missing' | 'open_started'
  | 'open_failed' | 'open_completed' | 'already_consumed' | 'expired';

type MachineDefinition<M extends ChatLifecycleMachine> = {
  initial: ChatLifecycleStateByMachine[M];
  transitions: Readonly<Record<ChatLifecycleStateByMachine[M], Readonly<Partial<Record<ChatLifecycleEvent, ChatLifecycleStateByMachine[M]>>>>>;
};

const DEFINITIONS: { [M in ChatLifecycleMachine]: MachineDefinition<M> } = {
  outgoing_message: {
    initial: 'queued',
    transitions: {
      queued: { enqueue: 'queued', retry_requested: 'queued', send_started: 'sending', retryable_failure: 'retryable_failed', terminal_failure: 'terminal_failed', cancel_requested: 'cancelled', delete_requested: 'deleted' },
      sending: { send_started: 'sending', finalize_succeeded: 'sent', retryable_failure: 'retryable_failed', terminal_failure: 'terminal_failed', cancel_requested: 'cancelled', delivery_confirmed: 'delivered', read_confirmed: 'read' },
      sent: { finalize_succeeded: 'sent', delivery_confirmed: 'delivered', read_confirmed: 'read', delete_requested: 'deleted' },
      delivered: { delivery_confirmed: 'delivered', read_confirmed: 'read', delete_requested: 'deleted' },
      read: { read_confirmed: 'read', delete_requested: 'deleted' },
      retryable_failed: { retryable_failure: 'retryable_failed', retry_requested: 'queued', terminal_failure: 'terminal_failed', cancel_requested: 'cancelled', delete_requested: 'deleted' },
      terminal_failed: { terminal_failure: 'terminal_failed', delete_requested: 'deleted' },
      cancelled: { cancel_requested: 'cancelled', delete_requested: 'deleted' },
      deleted: { delete_requested: 'deleted' },
    },
  },
  outgoing_attachment: {
    initial: 'queued',
    transitions: {
      queued: { enqueue: 'queued', retry_requested: 'queued', prepare_started: 'preparing', source_missing: 'missing_local_file', retryable_failure: 'retryable_failed', terminal_failure: 'terminal_failed', cancel_requested: 'cancelled', delete_requested: 'deleted' },
      preparing: { prepare_started: 'preparing', upload_started: 'uploading', source_missing: 'missing_local_file', retryable_failure: 'retryable_failed', terminal_failure: 'terminal_failed', cancel_requested: 'cancelled' },
      uploading: { upload_started: 'uploading', upload_paused: 'paused', upload_completed: 'finalizing', retryable_failure: 'retryable_failed', terminal_failure: 'terminal_failed', source_missing: 'missing_local_file', cancel_requested: 'cancelled' },
      paused: { upload_paused: 'paused', upload_started: 'uploading', retryable_failure: 'retryable_failed', terminal_failure: 'terminal_failed', source_missing: 'missing_local_file', cancel_requested: 'cancelled' },
      finalizing: { upload_completed: 'finalizing', finalize_succeeded: 'sent', retryable_failure: 'retryable_failed', terminal_failure: 'terminal_failed', cancel_requested: 'cancelled' },
      sent: { finalize_succeeded: 'sent', delete_requested: 'deleted' },
      retryable_failed: { retryable_failure: 'retryable_failed', retry_requested: 'queued', source_missing: 'missing_local_file', terminal_failure: 'terminal_failed', cancel_requested: 'cancelled', delete_requested: 'deleted' },
      terminal_failed: { terminal_failure: 'terminal_failed', delete_requested: 'deleted' },
      missing_local_file: { source_missing: 'missing_local_file', delete_requested: 'deleted', cancel_requested: 'cancelled' },
      cancelled: { cancel_requested: 'cancelled', delete_requested: 'deleted' },
      deleted: { delete_requested: 'deleted' },
    },
  },
  incoming_cache: {
    initial: 'remote_only',
    transitions: {
      remote_only: { retry_requested: 'remote_only', download_started: 'downloading', retryable_failure: 'retryable_failed', terminal_failure: 'terminal_failed', delete_requested: 'deleted' },
      downloading: { download_started: 'downloading', download_succeeded: 'available_offline', retryable_failure: 'retryable_failed', terminal_failure: 'terminal_failed', delete_requested: 'deleted' },
      available_offline: { download_succeeded: 'available_offline', local_file_missing: 'missing_local_file', delete_requested: 'deleted' },
      retryable_failed: { retryable_failure: 'retryable_failed', retry_requested: 'remote_only', terminal_failure: 'terminal_failed', delete_requested: 'deleted' },
      terminal_failed: { terminal_failure: 'terminal_failed', delete_requested: 'deleted' },
      missing_local_file: { local_file_missing: 'missing_local_file', retry_requested: 'remote_only', delete_requested: 'deleted' },
      deleted: { delete_requested: 'deleted' },
    },
  },
  view_once: {
    initial: 'available',
    transitions: {
      available: { open_started: 'opening', open_failed: 'available', already_consumed: 'consumed', expired: 'expired', delete_requested: 'deleted' },
      opening: { open_started: 'opening', open_failed: 'available', open_completed: 'consumed', already_consumed: 'consumed', expired: 'expired', delete_requested: 'deleted' },
      consumed: { open_completed: 'consumed', already_consumed: 'consumed', delete_requested: 'deleted' },
      expired: { expired: 'expired', delete_requested: 'deleted' },
      deleted: { delete_requested: 'deleted' },
    },
  },
  album: {
    initial: 'queued',
    transitions: {
      queued: { enqueue: 'queued', retry_requested: 'queued', prepare_started: 'preparing', retryable_failure: 'retryable_failed', terminal_failure: 'terminal_failed', cancel_requested: 'cancelled', delete_requested: 'deleted' },
      preparing: { prepare_started: 'preparing', upload_started: 'uploading', retryable_failure: 'retryable_failed', terminal_failure: 'terminal_failed', cancel_requested: 'cancelled' },
      uploading: { upload_started: 'uploading', upload_completed: 'finalizing', retryable_failure: 'retryable_failed', terminal_failure: 'terminal_failed', cancel_requested: 'cancelled' },
      finalizing: { upload_completed: 'finalizing', finalize_succeeded: 'sent', retryable_failure: 'retryable_failed', terminal_failure: 'terminal_failed', cancel_requested: 'cancelled' },
      sent: { finalize_succeeded: 'sent', delete_requested: 'deleted' },
      retryable_failed: { retryable_failure: 'retryable_failed', retry_requested: 'queued', terminal_failure: 'terminal_failed', cancel_requested: 'cancelled', delete_requested: 'deleted' },
      terminal_failed: { terminal_failure: 'terminal_failed', delete_requested: 'deleted' },
      cancelled: { cancel_requested: 'cancelled', delete_requested: 'deleted' },
      deleted: { delete_requested: 'deleted' },
    },
  },
};

export type ChatLifecycleTransition<M extends ChatLifecycleMachine> = {
  machine: M;
  from: ChatLifecycleStateByMachine[M];
  to: ChatLifecycleStateByMachine[M];
  event: ChatLifecycleEvent;
  occurredAt: string;
  idempotent: boolean;
};

export const getInitialChatLifecycleState = <M extends ChatLifecycleMachine>(machine: M) =>
  DEFINITIONS[machine].initial;

export const transitionChatLifecycle = <M extends ChatLifecycleMachine>(args: {
  machine: M;
  currentState: ChatLifecycleStateByMachine[M];
  event: ChatLifecycleEvent;
  now?: Date;
}): ChatLifecycleTransition<M> => {
  const definition = DEFINITIONS[args.machine] as MachineDefinition<M>;
  const next = definition.transitions[args.currentState]?.[args.event];
  if (!next) {
    throw new Error(
      `invalid_chat_lifecycle_transition:${args.machine}:${args.currentState}:${args.event}`,
    );
  }
  return {
    machine: args.machine,
    from: args.currentState,
    to: next,
    event: args.event,
    occurredAt: (args.now ?? new Date()).toISOString(),
    idempotent: next === args.currentState,
  };
};

export const getChatLifecycleDefinition = <M extends ChatLifecycleMachine>(machine: M) =>
  DEFINITIONS[machine];

const OUTGOING_MESSAGE_PROGRESS: Readonly<Record<OutgoingMessageState, number>> = {
  terminal_failed: 0,
  retryable_failed: 0,
  cancelled: 0,
  queued: 1,
  sending: 2,
  sent: 3,
  delivered: 4,
  read: 5,
  deleted: 6,
};

/** Reconciles stale cache/realtime snapshots without allowing receipt regressions. */
export const mergeOutgoingMessageLifecycleState = (
  current: OutgoingMessageState,
  incoming: OutgoingMessageState,
) => OUTGOING_MESSAGE_PROGRESS[current] >= OUTGOING_MESSAGE_PROGRESS[incoming]
  ? current
  : incoming;
