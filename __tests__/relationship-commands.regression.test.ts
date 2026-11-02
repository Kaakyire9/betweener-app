import assert from 'node:assert/strict';
import test from 'node:test';
import { createRelationshipCommands, RelationshipCommandError } from '../lib/relationships/relationship-commands.ts';

test('signal acceptance sends only the source identifier; server derives both participants', async () => {
  const calls: unknown[] = [];
  const commands = createRelationshipCommands(async (command, args) => {
    calls.push({ command, args });
    return { data: 'server-match-id', error: null };
  });
  assert.equal(await commands.acceptProfileSignal('signal-id'), 'server-match-id');
  assert.deepEqual(calls, [{ command: 'rpc_accept_profile_signal', args: { p_signal_id: 'signal-id' } }]);
});

test('compatibility relationship read never submits an acceptance or actor boolean', async () => {
  const calls: unknown[] = [];
  const commands = createRelationshipCommands(async (command, args) => {
    calls.push({ command, args });
    return { data: 'existing-match', error: null };
  });
  assert.equal(await commands.getAcceptedRelationship('peer-profile'), 'existing-match');
  assert.deepEqual(calls, [{ command: 'rpc_get_accepted_relationship', args: { p_peer_profile_id: 'peer-profile' } }]);
});

test('failed server authorization is surfaced and cannot produce optimistic acceptance', async () => {
  const commands = createRelationshipCommands(async () => ({ data: null, error: { message: 'signal_accept_forbidden' } }));
  await assert.rejects(commands.acceptProfileSignal('signal'), (error: unknown) =>
    error instanceof RelationshipCommandError && error.code === 'signal_accept_forbidden');
});

test('historical uncertain signal gives actionable reconfirmation guidance', async () => {
  const commands = createRelationshipCommands(async () => ({ data: null, error: { message: 'relationship_reconfirmation_required' } }));
  await assert.rejects(commands.acceptProfileSignal('signal'), (error: unknown) =>
    error instanceof RelationshipCommandError && error.message.includes('new chat request'));
});

test('an invalid successful response cannot be treated as an accepted relationship', async () => {
  const commands = createRelationshipCommands(async () => ({ data: { accepted: true }, error: null }));
  await assert.rejects(commands.acceptProfileSignal('signal'), (error: unknown) =>
    error instanceof RelationshipCommandError && error.code === 'relationship_result_invalid');
});
