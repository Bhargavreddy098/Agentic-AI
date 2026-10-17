import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { getDemoConfig, fixtureEnvironment, runDemo } from './run-applet.mjs';

test('demo startup is loopback-only by default and rejects live UI', () => {
  assert.equal(getDemoConfig({}).host, '127.0.0.1');
  assert.equal(getDemoConfig({ ASI_DEV_HOST: '0.0.0.0' }).host, '0.0.0.0');
  assert.throws(() => getDemoConfig({ NEXT_PUBLIC_ASI_UI_MODE: 'live' }), /demo/i);
  assert.throws(() => getDemoConfig({ ASI_DEV_STARTUP_TIMEOUT_MS: 'Infinity' }), /timeout/i);
});
test('fixture receives system essentials and explicit demo configuration, never credentials', () => {
  const env = fixtureEnvironment({ PATH: 'bin', SystemRoot: 'windows', TEMP: 'temp', OPENAI_API_KEY: 'secret', DATABASE_URL: 'secret', ASI_SIGNING_KEY: 'secret', NODE_OPTIONS: '--require evil', ASI_DEMO_PREVIEW_ORIGINS: 'https://preview.example' });
  assert.equal(env.PATH, 'bin');
  assert.equal(env.SystemRoot, 'windows');
  assert.equal(env.ASI_DEV_HOST, undefined);
  assert.equal(env.ASI_DEMO_PREVIEW_ORIGINS, 'https://preview.example');
  for (const name of ['OPENAI_API_KEY', 'DATABASE_URL', 'ASI_SIGNING_KEY', 'NODE_OPTIONS']) assert.equal(env[name], undefined);
});
const listen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address().port)); });
const close = server => new Promise(resolve => server.close(resolve));
async function freePort() { const server = net.createServer(); const port = await listen(server); await close(server); return port; }
test('occupied ports fail without terminating the unrelated listener', async () => {
  const server = net.createServer(); const port = await listen(server);
  try {
    await assert.rejects(runDemo({ config: { host: '127.0.0.1', fixturePort: port, webPort: await freePort(), timeoutMs: 1000 }, compile: false }), /port.*occupied/i);
    assert.equal(server.listening, true);
  } finally { await close(server); }
});
test('fixture startup failure stops before Next starts', { timeout: 8000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'asi-startup-'));
  const fixture = join(dir, 'fixture.cjs');
  const next = join(dir, 'next.cjs');
  const marker = join(dir, 'web-started');
  await writeFile(fixture, 'process.exit(7)');
  await writeFile(next, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started')`);
  try {
    await assert.rejects(runDemo({ config: { host: '127.0.0.1', fixturePort: await freePort(), webPort: await freePort(), timeoutMs: 2000 }, compile: false, entries: { fixture, next }, webDir: dir }), /fixture.*7/i);
    const { existsSync } = await import('node:fs');
    assert.equal(existsSync(marker), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Next failure terminates the ready fixture process', { timeout: 10000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'asi-lifecycle-'));
  const fixture = join(dir, 'fixture.cjs');
  const next = join(dir, 'next.cjs');
  const pidFile = join(dir, 'fixture.pid');
  const port = await freePort();
  await writeFile(fixture, `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); require('node:http').createServer((req,res)=>{res.setHeader('x-asi-demo','true');res.end(JSON.stringify({demoMode:true}));}).listen(${port},'127.0.0.1');`);
  await writeFile(next, 'process.exit(9)');
  try {
    await assert.rejects(runDemo({ config: { host: '127.0.0.1', fixturePort: port, webPort: await freePort(), timeoutMs: 2000 }, compile: false, entries: { fixture, next }, webDir: dir }), /Next UI.*9/i);
    const { readFile } = await import('node:fs/promises');
    const pid = Number(await readFile(pidFile, 'utf8'));
    assert.throws(() => process.kill(pid, 0), /ESRCH/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('fixture readiness is bounded and timeout terminates its process', { timeout: 8000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'asi-timeout-'));
  const fixture = join(dir, 'fixture.cjs');
  const pidFile = join(dir, 'fixture.pid');
  await writeFile(fixture, `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));setInterval(()=>{},1000);`);
  try {
    await assert.rejects(runDemo({ config: { host: '127.0.0.1', fixturePort: await freePort(), webPort: await freePort(), timeoutMs: 400 }, compile: false, entries: { fixture, next: fixture }, webDir: dir }), /fixture.*ready.*400/i);
    const { readFile } = await import('node:fs/promises');
    const pid = Number(await readFile(pidFile, 'utf8'));
    assert.throws(() => process.kill(pid, 0), /ESRCH/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('SIGTERM shuts down both ready child processes', { timeout: 10000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'asi-signal-'));
  const fixture = join(dir, 'fixture.cjs');
  const next = join(dir, 'next.cjs');
  const fixturePid = join(dir, 'fixture.pid');
  const nextPid = join(dir, 'next.pid');
  const fixturePort = await freePort();
  const webPort = await freePort();
  await writeFile(fixture, `require('node:fs').writeFileSync(${JSON.stringify(fixturePid)}, String(process.pid)); require('node:http').createServer((req,res)=>{res.setHeader('x-asi-demo','true');res.end(JSON.stringify({demoMode:true}));}).listen(${fixturePort},'127.0.0.1');`);
  await writeFile(next, `require('node:fs').writeFileSync(${JSON.stringify(nextPid)}, String(process.pid)); require('node:http').createServer((req,res)=>res.end('ready')).listen(${webPort},'127.0.0.1');`);
  const { existsSync } = await import('node:fs');
  const { readFile } = await import('node:fs/promises');
  let timer;
  try {
    const running = runDemo({ config: { host: '127.0.0.1', fixturePort, webPort, timeoutMs: 2500 }, compile: false, entries: { fixture, next }, webDir: dir });
    timer = setInterval(() => { if (existsSync(nextPid)) { clearInterval(timer); process.emit('SIGTERM'); } }, 50);
    assert.equal(await running, 143);
    for (const file of [fixturePid, nextPid]) {
      const pid = Number(await readFile(file, 'utf8'));
      assert.throws(() => process.kill(pid, 0), /ESRCH/);
    }
  } finally { clearInterval(timer); await rm(dir, { recursive: true, force: true }); }
});
