import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, pathParamsFor } from '../components/console/parse.ts';

test('parses a known command to exactly one route', () => {
  const r = parseCommand('create project "asi-core" --kind greenfield');
  assert.equal(r.ok, true);
  assert.equal(r.route.method, 'POST');
  assert.equal(r.route.path, '/projects');
  assert.equal(r.positional[0], 'asi-core');
  assert.equal(r.flags.kind, 'greenfield');
});

test('unknown command is rejected locally', () => {
  const r = parseCommand('frobnicate the widget');
  assert.equal(r.ok, false);
  assert.ok(r.error.length > 0);
  assert.equal(r.route, undefined);
});

test('unknown flag is rejected locally', () => {
  assert.equal(parseCommand('create project "x" --nope 1').ok, false);
});

test('--if-match is captured for PATCH commands', () => {
  const r = parseCommand('patch project 7f3a --if-match v1');
  assert.equal(r.ok, true);
  assert.equal(r.route.method, 'PATCH');
  assert.equal(r.route.path, '/projects/:projectId');
  assert.equal(r.flags['if-match'], 'v1');
});

test('quoted values survive spaces', () => {
  const r = parseCommand('create conversation 7f3a --title "My first chat"');
  assert.equal(r.ok, true);
  assert.equal(r.route.path, '/projects/:projectId/conversations');
  assert.equal(r.flags.title, 'My first chat');
});

test('path params map positionally to route placeholders', () => {
  const r = parseCommand('patch project abc123 --if-match v1');
  assert.deepEqual(pathParamsFor(r.route, r.positional), { projectId: 'abc123' });
});

test('missing required positional is rejected', () => {
  assert.equal(parseCommand('get approval').ok, false);
});
