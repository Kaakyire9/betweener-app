import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canShowRelationshipGistEditorialNavigation } from '../features/relationship-gists/editorial/relationship-gist-editorial-permissions.ts';

const adminScreen = readFileSync(new URL('../app/admin.tsx', import.meta.url), 'utf8');
const studioScreen = readFileSync(new URL('../app/studio.tsx', import.meta.url), 'utf8');
const studioModules = readFileSync(new URL('../features/studio/config/studio-modules.ts', import.meta.url), 'utf8');
const studioCard = readFileSync(new URL('../features/studio/components/StudioModuleCard.tsx', import.meta.url), 'utf8');
const adminAccess = readFileSync(new URL('../lib/admin/admin-access.ts', import.meta.url), 'utf8');
const adminEditorial = readFileSync(new URL('../app/admin-editorial.tsx', import.meta.url), 'utf8');

test('editorial navigation is shown only when the server grants read access', () => {
  assert.equal(canShowRelationshipGistEditorialNavigation({ can_read: true }), true);
  assert.equal(canShowRelationshipGistEditorialNavigation({ can_read: false }), false);
  assert.equal(canShowRelationshipGistEditorialNavigation(null), false);
  assert.equal(canShowRelationshipGistEditorialNavigation({ can_draft: true }), false);
});

test('admin dashboard uses the shared server-backed capability model for its accessible route entry', () => {
  assert.match(adminAccess, /rpc_get_my_admin_context/);
  assert.match(adminScreen, /router\.push\('\/studio'\)/);
  assert.match(adminScreen, /MODULES\.filter\(\(module\) => access\.can\(module\.capability\)\)/);
  assert.match(studioScreen, /access\.can\('editorial'\)/);
  assert.match(studioModules, /actionHref: '\/admin-editorial'/);
  assert.match(studioModules, /AI Editorial Studio/);
  assert.match(adminScreen, /accessibilityRole="button"/);
  assert.match(studioCard, /accessibilityLabel=\{module\.actionLabel\}/);
});

test('navigation authorization fails closed when permission verification errors', () => {
  assert.match(adminAccess, /if \(!value \|\| typeof value !== 'object'\) return EMPTY_CONTEXT/);
  assert.match(adminAccess, /if \(candidate\.isAdmin !== true\) return EMPTY_CONTEXT/);
  assert.match(adminAccess, /capabilities\.includes\(capability\)/);
  assert.match(adminEditorial, /capability="editorial"/);
});
