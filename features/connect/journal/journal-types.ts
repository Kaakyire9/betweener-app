import type { ConnectSession } from '../domain/connect.ts';

export type JournalOutcome = 'initiated' | 'ringing' | 'answered' | 'active' | 'reconnecting' | 'ending'
  | 'ended' | 'declined' | 'missed' | 'cancelled' | 'no_answer' | 'busy' | 'failed' | 'interrupted' | 'blocked' | 'not_connected';
export interface JournalEntry {
  call: ConnectSession;
  direction: 'incoming' | 'outgoing';
  peer: { profileId: string; userId: string; name: string; avatar: string | null; available: boolean; blocked: boolean; chatVisible: boolean; chatHiddenBefore?: string | null };
  cleanup: 'pending' | 'acknowledged' | 'not_applicable';
  redialAllowed: boolean;
}
export interface JournalCursor { at: string; id: string }
export interface JournalQuery {
  scope?: 'history' | 'chat'; peerUserId?: string; search?: string;
  filter?: 'all' | 'missed' | 'voice' | 'video'; direction?: 'all' | 'incoming' | 'outgoing';
  outcome?: 'all' | 'ended' | 'declined' | 'cancelled' | 'interrupted' | 'failed';
  from?: string; to?: string; cursor?: JournalCursor | null; limit?: number; callId?: string;
}
export interface JournalPage { items: JournalEntry[]; nextCursor: JournalCursor | null }
export interface JournalHint { callId: string; version: number; deleted?: boolean }
export interface JournalService {
  readonly userId: string; readonly profileId: string; readonly epoch: string;
  current(): boolean;
  page(query: JournalQuery): Promise<JournalPage>;
  previews(peers: string[]): Promise<JournalEntry[]>;
  subscribe?(listener: (hint?: JournalHint) => void): () => void;
}
