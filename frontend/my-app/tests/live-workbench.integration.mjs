import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createPostgresFixture } from '../../../backend/tests/fixtures/postgres.js';
import { createContainer } from '../../../backend/src/bootstrap/container.js';
import { loadConfig } from '../../../backend/config/env.js';
import { actionsFor, prepareAction } from '../lib/api/workbench.ts';
import { createClient } from '../lib/api/client.ts';
import { workspaceApi, messageBody, orderedMessages, saveFirstMessage } from '../lib/api/desktop-workspace.ts';

test('frontend forms round-trip real PostgreSQL projects, messages, settings and budgets with scope and CAS denial', { timeout: 120000 }, async () => {
  const fixture = await createPostgresFixture({ poolMax: 4 });
  let container, server;
  try {
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: fixture.runtimeUrl.href });
    container = await createContainer({ config });
    server = container.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const principalId = randomUUID(), workspaceId = randomUUID();
    await fixture.owner.query("INSERT INTO identity.principals(principal_id,kind,display_name) VALUES($1,'local_user','UI fixture')", [principalId]);
    await fixture.owner.query('INSERT INTO identity.workspaces(workspace_id,owner_principal_id,slug,display_name) VALUES($1,$2,$3,$4)', [workspaceId, principalId, `ui-${workspaceId}`, 'UI fixture']);
    const bootstrap = await fetch(`${base}/api/v1/session/bootstrap`, { method: 'POST', headers: { origin: config.allowedOrigins[0], 'content-type': 'application/json' }, body: JSON.stringify(await container.services.identity.issueChallenge({ principalId, workspaceId })) });
    assert.equal(bootstrap.status, 200);
    const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
    const csrf = (await bootstrap.json()).data.csrfToken;
    // Only this fixture transport adds browser-owned headers. The frontend client never does.
    const transport = (path, opts) => fetch(base + path, { ...opts, headers: { ...opts.headers, cookie, origin: config.allowedOrigins[0] } });
    const client = createClient({ transport, getCsrfToken: () => csrf, maxRetries: 0 });
    const desktop = workspaceApi(client);
    async function action(surface, name, values = {}, expected = 200) {
      const spec = actionsFor(surface).find(c => c.name === name);
      const packet = prepareAction(spec, values, csrf);
      const result = await client.request(packet.route, packet.options);
      assert.equal(result.ok, true, JSON.stringify(result.ok ? {} : result.problem));
      assert.equal(result.status, expected);
      return result;
    }
    const firstKey=randomUUID();const firstConversation=await saveFirstMessage(desktop,'','My first saved message',[],firstKey);const repeated=await saveFirstMessage(desktop,'','My first saved message',[],firstKey);assert.equal(repeated.id,firstConversation.id);const firstMessages=await desktop('/conversations/:conversationId/messages',{pathParams:{conversationId:String(firstConversation.id)}});assert.equal(firstMessages.data.length,1);assert.equal(firstMessages.data[0].text,'My first saved message');
    const project = (await action('projects', 'create project', { name: 'Form integration fixture', kind: 'greenfield' }, 201)).data;
    const before = await action('projects', 'get project', { projectId: project.id });
    const updated = await action('projects', 'patch project', { projectId: project.id, name: 'Updated through form', 'if-match': String(before.data.version) });
    assert.equal(updated.data.name, 'Updated through form');
    const stale = prepareAction(actionsFor('projects').find(c => c.name === 'patch project'), { projectId: project.id, name: 'Stale write', 'if-match': String(before.data.version) }, csrf);
    const conflict = await client.request(stale.route, stale.options);
    assert.equal(conflict.ok, false);
    assert.ok([409, 412].includes(conflict.problem.status));
    const conversation = (await action('conversations', 'create conversation', { projectId: project.id, title: 'Form conversation' }, 201)).data;
    await action('conversations', 'send message', { conversationId: conversation.id, text: 'Persisted from the form packet' }, 201);
    const messages = await action('conversations', 'list messages', { conversationId: conversation.id, limit: '1' });
    assert.equal(messages.data.length, 1);
    assert.equal(messages.data[0].text, 'Persisted from the form packet');
    const desktopConversation = await desktop('/projects/:projectId/conversations', { pathParams: { projectId: project.id }, body: { title: 'Desktop composer fixture' } }, 'POST');
    assert.equal(desktopConversation.status, 201);
    const desktopId = desktopConversation.data.id;
    await desktop('/conversations/:conversationId/messages', { pathParams: { conversationId: desktopId }, body: messageBody('Desktop composer persisted text', []) }, 'POST');
    const desktopMessages = await desktop('/conversations/:conversationId/messages', { pathParams: { conversationId: desktopId }, query: { limit: '30' } });
    assert.equal(orderedMessages(desktopMessages.data)[0].text, 'Desktop composer persisted text');
    await assert.rejects(desktop('/runs'), /not available/);
    const settings = await action('settings', 'get settings');
    const saved = await action('settings', 'patch settings', { 'default-autonomy': 'plan_only', 'if-match': String(settings.data.version) });
    assert.equal(saved.data.defaultAutonomy, 'plan_only');
    const budget = await action('budgets', 'create budget', { projectId: project.id, 'scope-kind': 'project', 'limit-micro-usd': '2500000', reason: 'Disposable fixture ceiling' }, 201);
    assert.equal(budget.data.limitMicroUsd, '2500000');
    assert.ok((await action('budgets', 'list budgets', { projectId: project.id })).data.some(b => b.id === budget.data.id));
    for (const [surface, name] of [['providers', 'list providers'], ['models', 'list models'], ['capabilities', 'list capabilities']]) await action(surface, name);
    const unknownProject = randomUUID();
    const denied = prepareAction(actionsFor('artifacts').find(c => c.name === 'list artifacts'), { projectId: unknownProject }, csrf);
    const result = await client.request(denied.route, denied.options);
    assert.equal(result.ok, false);
    assert.equal(result.problem.status, 404);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (container) for (const resource of container.resources) await resource.close();
    await fixture.close();
  }
});
