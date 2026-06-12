// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';

import { preserveUnchangedMessageReferences } from '../lib/chat/message-list-reconciliation.ts';

const message = (id: string, status = 'sent') => ({
  id,
  text: id,
  senderId: 'user-a',
  timestamp: new Date('2026-06-11T10:00:00.000Z'),
  type: 'text',
  reactions: [],
  status,
});

const getKey = (item) => `${item.id}:${item.status}:${item.text}`;

test('message reconciliation keeps the current array when nothing changed', () => {
  const current = [message('one'), message('two')];
  const next = current.map((item) => ({ ...item }));

  const reconciled = preserveUnchangedMessageReferences(current, next, getKey);

  assert.equal(reconciled, current);
  assert.equal(reconciled[0], current[0]);
  assert.equal(reconciled[1], current[1]);
});

test('message reconciliation replaces only the changed message', () => {
  const current = [message('one'), message('two'), message('three')];
  const next = [
    { ...current[0] },
    { ...current[1], status: 'read' },
    { ...current[2] },
  ];

  const reconciled = preserveUnchangedMessageReferences(current, next, getKey);

  assert.notEqual(reconciled, current);
  assert.equal(reconciled[0], current[0]);
  assert.notEqual(reconciled[1], current[1]);
  assert.equal(reconciled[2], current[2]);
  assert.equal(reconciled[1].status, 'read');
});

test('message reconciliation preserves stable rows when the list grows', () => {
  const current = [message('one'), message('two')];
  const next = [{ ...current[0] }, { ...current[1] }, message('three')];

  const reconciled = preserveUnchangedMessageReferences(current, next, getKey);

  assert.equal(reconciled[0], current[0]);
  assert.equal(reconciled[1], current[1]);
  assert.equal(reconciled[2].id, 'three');
});
