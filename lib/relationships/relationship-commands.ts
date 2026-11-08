export type RelationshipCommand = 'rpc_accept_profile_signal' | 'rpc_get_accepted_relationship';
export type RelationshipCommandPort = (
  command: RelationshipCommand,
  args: Record<string, string>,
) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;

export class RelationshipCommandError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code === 'relationship_reconfirmation_required'
      ? 'Ask them to send a new chat request to confirm this connection.'
      : 'This connection is unavailable. Refresh and try again.');
    this.name = 'RelationshipCommandError';
    this.code = code;
  }
}

/** Commands identify the source/peer only. The backend derives the actor. */
export function createRelationshipCommands(invoke: RelationshipCommandPort) {
  const run = async (command: RelationshipCommand, args: Record<string, string>): Promise<string> => {
    const { data, error } = await invoke(command, args);
    if (error) throw new RelationshipCommandError(error.message ?? error.code ?? 'relationship_unavailable');
    if (typeof data !== 'string' || data.length === 0) {
      throw new RelationshipCommandError('relationship_result_invalid');
    }
    return data;
  };
  return {
    acceptProfileSignal: (signalId: string) => run('rpc_accept_profile_signal', { p_signal_id: signalId }),
    getAcceptedRelationship: (peerProfileId: string) => run('rpc_get_accepted_relationship', { p_peer_profile_id: peerProfileId }),
  };
}
