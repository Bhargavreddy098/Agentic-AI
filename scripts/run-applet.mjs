#!/usr/bin/env node
// This launcher serves the synthetic UI demo only. The workspace build stays pnpm -r build.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function getDemoConfig(env = process.env) {
  if (env.NEXT_PUBLIC_ASI_UI_MODE && env.NEXT_PUBLIC_ASI_UI_MODE !== 'demo') throw new Error('This launcher supports demo UI only; use the live Gateway launcher for live mode.');
  const timeoutMs = Number(env.ASI_DEV_STARTUP_TIMEOUT_MS ?? 60000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300000) throw new Error('Invalid startup timeout: expected 100 through 300000 milliseconds.');
  const host = env.ASI_DEV_HOST ?? '127.0.0.1';
  if (!host || /[\s/]/.test(host)) throw new Error('ASI_DEV_HOST must be a hostname or IP address.');
  return { host, fixturePort: 4300, webPort: 3000, timeoutMs };
}
export function fixtureEnvironment(env) {
  const safe = {};
  for (const [name, value] of Object.entries(env)) {
    if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|LANG|LC_ALL|TZ)$/i.test(name) && value !== undefined) safe[name] = value;
  }
  for (const name of ['ASI_DEMO_PREVIEW_ORIGINS', 'ASI_DEMO_TRUST_PROXY', 'ASI_DEMO_CROSS_SITE_COOKIES']) {
    if (env[name] !== undefined) safe[name] = env[name];
  }
  return { ...safe, NODE_ENV: 'development' };
}
function runtime(packagePath, specifier) {
  try { return createRequire(join(rootDir, packagePath, 'package.json')).resolve(specifier); }
  catch { throw new Error(`Cannot resolve ${specifier}. Install the workspace with pnpm install --frozen-lockfile first.`); }
}
function compileDemo(onlyIfMissing = false) {
  const builtTargets = [
    'packages/contracts/dist/index.js',
    'packages/contracts/dist/ui/index.js',
    'packages/ui/dist/index.js',
    'apps/gateway-fixture/dist/main.js',
  ];
  if (onlyIfMissing && builtTargets.every(rel => existsSync(join(rootDir, rel)))) return;
  const tsc = runtime('', 'typescript/bin/tsc');
  for (const project of ['packages/contracts', 'packages/ui', 'apps/gateway-fixture']) {
    execFileSync(process.execPath, [tsc, '-p', join(rootDir, project, 'tsconfig.json')], { cwd: rootDir, stdio: 'inherit', timeout: 120000 });
  }
}
async function assertPortAvailable(host, port) {
  const server = net.createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', error => reject(new Error(`Demo port ${port} is occupied or unavailable (${error.code}). Stop that service or choose a separate demo environment.`)));
    server.listen({ host, port, exclusive: true }, () => server.close(resolvePromise));
  });
}
function childProcess(label, entry, args, options, fail) {
  const child = spawn(process.execPath, [entry, ...args], { ...options, stdio: 'inherit', detached: process.platform !== 'win32' });
  child.once('error', () => fail(new Error(`${label} failed to start.`)));
  child.once('exit', (code, signal) => fail(new Error(`${label} exited unexpectedly (${code ?? signal}).`)));
  return child;
}
async function stopTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    await new Promise(resolvePromise => {
      const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      killer.once('error', resolvePromise); killer.once('exit', resolvePromise);
    });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { return; }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 200));
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already stopped */ }
  }
}
async function ready(url, label, timeoutMs, failure, signal, fixture = false) {
  const deadline = Date.now() + timeoutMs;
  const poll = async () => {
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      try {
        const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(Math.min(1000, Math.max(1, deadline - Date.now())))]) });
        if (fixture) {
          const body = await response.json();
          if (response.ok && response.headers.get('x-asi-demo') === 'true' && body.demoMode === true) return;
        } else if (response.status >= 200 && response.status < 400) { await response.body?.cancel(); return; }
      } catch { /* retry only until the startup deadline */ }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
    }
    throw new Error(`${label} did not become ready within ${timeoutMs}ms.`);
  };
  await Promise.race([poll(), failure]);
}
export async function runDemo(options = {}) {
  const env = options.env ?? process.env;
  const config = options.config ?? getDemoConfig(env);
  // Even injected configuration cannot silently change this launcher to live mode.
  getDemoConfig(env);
  // Only the UI bind is configurable; the synthetic gateway stays private on loopback.
  await assertPortAvailable("127.0.0.1", config.fixturePort);
  await assertPortAvailable(config.host, config.webPort);
  if (options.compile !== false) compileDemo(options.mode === 'dev' && options.compile !== true);
  const webDir = options.webDir ?? join(rootDir, 'apps/web');
  const next = options.entries?.next ?? runtime('apps/web', 'next/dist/bin/next');
  const fixture = options.entries?.fixture ?? join(rootDir, 'apps/gateway-fixture/dist/main.js');
  const webEnv = { ...env, NEXT_PUBLIC_ASI_UI_MODE: 'demo' };
  // Rebuild with demo mode so an existing live build cannot be paired with the fixture.
  if (options.mode === 'start') {
    execFileSync(process.execPath, [next, 'build'], { cwd: webDir, env: webEnv, stdio: 'inherit', timeout: 300000 });
  }
  const children = [];
  const startupController = new AbortController();
  let fail;
  const failure = new Promise((_, reject) => { fail = reject; });
  // Register before starting any process to avoid an unhandled early child exit.
  failure.catch(() => {});
  let signalExit;
  const interrupted = new Promise(resolvePromise => { signalExit = resolvePromise; });
  const onInterrupt = () => signalExit(130);
  const onTerminate = () => signalExit(143);
  process.once('SIGINT', onInterrupt); process.once('SIGTERM', onTerminate);
  try {
    children.push(childProcess('Demo fixture', fixture, [], { cwd: rootDir, env: fixtureEnvironment(env) }, fail));
    const connectHost = config.host === '0.0.0.0' || config.host === '::' ? '127.0.0.1' : config.host;
    const hostForUrl = connectHost.includes(':') ? `[${connectHost}]` : connectHost;
    const startup = async () => {
      await ready(`http://127.0.0.1:${config.fixturePort}/api/ui/v1/me`, 'Demo fixture', config.timeoutMs, failure, startupController.signal, true);
      startupController.signal.throwIfAborted();
      children.push(childProcess('Next UI', next, [options.mode === 'start' ? 'start' : 'dev', '--hostname', config.host, '--port', String(config.webPort)], { cwd: webDir, env: webEnv }, fail));
      await ready(`http://${hostForUrl}:${config.webPort}`, 'Next UI', config.timeoutMs, failure, startupController.signal);
      console.log(`Synthetic demo ready at http://${hostForUrl}:${config.webPort}`);
      return failure;
    };
    return await Promise.race([startup(), interrupted]);
  } finally {
    startupController.abort();
    process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onTerminate);
    await Promise.all(children.map(stopTree));
  }
}
async function main() {
  const mode = process.argv[2] ?? 'dev';
  getDemoConfig();
  if (['build', 'gateway-build', 'typecheck'].includes(mode)) {
    compileDemo();
    if (mode === 'gateway-build') return;
    if (mode === 'typecheck') {
      execFileSync(process.execPath, [runtime('', 'typescript/bin/tsc'), '-p', join(rootDir, 'apps/web/tsconfig.json'), '--noEmit'], { cwd: rootDir, stdio: 'inherit', timeout: 120000 });
    } else {
      execFileSync(process.execPath, [runtime('apps/web', 'next/dist/bin/next'), 'build'], { cwd: join(rootDir, 'apps/web'), env: { ...process.env, NEXT_PUBLIC_ASI_UI_MODE: 'demo' }, stdio: 'inherit', timeout: 300000 });
    }
  } else if (mode === 'dev' || mode === 'start') process.exitCode = await runDemo({ mode });
  else throw new Error(`Unsupported demo command: ${mode}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Demo startup failed: ${error.message}`); process.exitCode = 1; });
}
