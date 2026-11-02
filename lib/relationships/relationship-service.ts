import { supabase } from '@/lib/supabase';
import { createRelationshipCommands, type RelationshipCommandPort } from './relationship-commands';

// New RPC signatures are additive. Keep the boundary typed until generated
// hosted types are refreshed in a separately authorized schema release.
const invoke: RelationshipCommandPort = (command, args) =>
  (supabase.rpc as unknown as RelationshipCommandPort)(command, args);

export const { acceptProfileSignal, getAcceptedRelationship } = createRelationshipCommands(invoke);
