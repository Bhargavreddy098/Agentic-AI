// Request bodies for console commands.
// Types follow the backend zod schemas exactly:
//   governance.routes.js  - budget limits are decimal STRINGS, grants take a JSON object
//   settings.js           - settingsPatch is a strict object of typed sub-objects
//   provider.schemas.js   - endpointPolicy/privacyPolicy are strict nested objects
//   product.routes.js     - PUT /uploads/:id/content takes RAW BYTES, not JSON

export type BodyResult =
  | { kind: 'none' }
  | { kind: 'json'; body: unknown }
  | { kind: 'bytes'; bytes: Uint8Array };

function json(obj: unknown): BodyResult {
  return { kind: 'json', body: obj };
}

function parseJsonFlag(raw: string | undefined, flag: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (raw === undefined) return { ok: false, error: `Missing --${flag}` };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, error: `--${flag} is not valid JSON` };
  }
}

// Decimal string, per contract. Rejects anything the backend would 400 on.
function decimalString(raw: string | undefined): string | { error: string } {
  if (raw === undefined) return { error: 'Missing --limit-micro-usd' };
  if (!/^\d{1,19}$/.test(raw)) return { error: '--limit-micro-usd must be a decimal string (digits only)' };
  return raw;
}

const KNOWN_CLASSIFICATIONS = ['public', 'internal'];

export function buildBody(
  route: { path: string; method: string },
  positional: string[],
  flags: Record<string, string>,
  selectedBytes?: Uint8Array
): BodyResult | { error: string } {
  const p = route.path;
  const m = route.method;

  // ---- stage 3 ----
  if (p === '/session/bootstrap') {
    if (!flags.challenge || !flags.nonce) return { error: 'connect session needs --challenge and --nonce' };
    return json({ challenge: flags.challenge, clientNonce: flags.nonce });
  }

  // ---- stage 4: projects / conversations ----
  if (p === '/projects' && m === 'POST') {
    const kind = flags.kind ?? 'greenfield';
    if (kind !== 'greenfield' && kind !== 'existing') return { error: '--kind must be greenfield or existing' };
    const body: Record<string, unknown> = { name: positional[0], kind };
    if (flags['workspace-root-ref']) body.workspaceRootRef = flags['workspace-root-ref'];
    if (flags['repository-connection-id']) body.repositoryConnectionId = flags['repository-connection-id'];
    return json(body);
  }
  if (p === '/projects/:projectId' && m === 'PATCH') {
    const body: Record<string, unknown> = {};
    if (flags.name) body.name = flags.name;
    if (flags.description) body.description = flags.description;
    if (!Object.keys(body).length) return { error: 'patch project needs --name or --description' };
    return json(body);
  }
  if (p.endsWith('/archive')) {
    if (!flags.reason) return { error: 'archive project needs --reason' };
    return json({ reason: flags.reason });
  }
  if (p.endsWith('/snapshots')) return json({ includeUncommitted: flags['include-uncommitted'] === 'true' });
  if (p.endsWith('/conversations') && m === 'POST') return json(flags.title ? { title: flags.title } : {});
  if (p.endsWith('/messages') && m === 'POST') {
    const text = flags.text ?? positional[1];
    if (!text) return { error: 'send message needs --text' };
    if (text.length > 32000) return { error: 'message text exceeds 32000 characters' };
    return json({ text, ...(flags['attachment-ids'] ? { attachmentIds: flags['attachment-ids'].split(',') } : {}) });
  }

  // ---- stage 4: uploads ----
  // PUT content expects raw bytes with the digest header supplied by the caller.
  if (p === '/uploads/:uploadId/content') {
    if (!selectedBytes) return { error: 'Choose a real file before uploading content.' };
    if (selectedBytes.byteLength > 16777216) return { error: 'File exceeds the 16 MiB upload limit.' };
    return { kind: 'bytes', bytes: selectedBytes };
  }
  if (p === '/projects/:projectId/uploads') {
    if (!flags.filename) return { error: 'create upload needs --filename' };
    if (!flags['media-type']) return { error: 'create upload needs --media-type' };
    if (!flags.bytes) return { error: 'create upload needs --bytes' };
    if (!flags.digest) return { error: 'create upload needs --digest (sha-256 hex)' };
    return json({ filename: flags.filename, mediaType: flags['media-type'], bytes: flags.bytes, digest: flags.digest });
  }
  if (p === '/uploads/:uploadId/complete') {
    if (!flags.digest) return { error: 'complete upload needs --digest' };
    return json({ digest: flags.digest });
  }
  if (p === '/artifacts/:artifactId/export') {
    if (!flags['destination-ref']) return { error: 'export artifact needs --destination-ref' };
    return json({ destinationRef: flags['destination-ref'] });
  }

  // ---- stage 5: governance ----
  if (p === '/settings' && m === 'PATCH') {
    const body: Record<string, unknown> = {};
    if (flags.retention) {
      const parsed = parseJsonFlag(flags.retention, 'retention');
      if (!parsed.ok) return { error: parsed.error };
      body.retention = parsed.value;
    }
    if (flags['default-autonomy']) body.defaultAutonomy = flags['default-autonomy'];
    if (flags.privacy) {
      const parsed = parseJsonFlag(flags.privacy, 'privacy');
      if (!parsed.ok) return { error: parsed.error };
      body.privacy = parsed.value;
    }
    if (flags.limits) {
      const parsed = parseJsonFlag(flags.limits, 'limits');
      if (!parsed.ok) return { error: parsed.error };
      body.limits = parsed.value;
    }
    if (!Object.keys(body).length) return { error: 'patch settings needs --retention, --default-autonomy, --privacy or --limits' };
    return json(body);
  }

  if (p === '/policies/revisions') {
    const rules = parseJsonFlag(flags.rules, 'rules');
    if (!rules.ok) return { error: rules.error };
    if (!flags.reason) return { error: 'create policy revision needs --reason' };
    const body: Record<string, unknown> = { rules: rules.value, reason: flags.reason };
    if (flags['base-revision-id']) body.baseRevisionId = flags['base-revision-id'];
    return json(body);
  }
  if (p.endsWith('/activate')) {
    if (!flags.digest) return { error: 'activate policy needs --digest' };
    return json({ digest: flags.digest });
  }

  if (p.endsWith('/grants') && m === 'POST') {
    if (!flags.capability) return { error: 'create grant needs --capability' };
    const scope = parseJsonFlag(flags['resource-scope'], 'resource-scope');
    if (!scope.ok) return { error: scope.error };
    if (!flags['expires-at']) return { error: 'create grant needs --expires-at (ISO datetime)' };
    return json({ capability: flags.capability, resourceScope: scope.value, expiresAt: flags['expires-at'], ...(flags['contract-revision-id'] ? { contractRevisionId: flags['contract-revision-id'] } : {}) });
  }
  if (p.endsWith('/revoke')) {
    if (!flags.reason) return { error: 'revoke needs --reason' };
    return json({ reason: flags.reason });
  }
  if (p.endsWith('/approval-requests')) {
    if (!flags.digest) return { error: 'request approval needs --digest' };
    return json({ digest: flags.digest });
  }
  if (p.endsWith('/decisions')) {
    if (flags.decision !== 'approve' && flags.decision !== 'reject') return { error: '--decision must be approve or reject' };
    if (!flags.nonce) return { error: 'decide approval needs --nonce' };
    if (!flags.digest) return { error: 'decide approval needs --digest' };
    const body: Record<string, unknown> = { decision: flags.decision, nonce: flags.nonce, digest: flags.digest };
    if (flags.reason) body.reason = flags.reason;
    return json(body);
  }

  if (p.endsWith('/budgets') && m === 'POST') {
    const kind = flags['scope-kind'];
    if (kind !== 'project' && kind !== 'run') return { error: '--scope-kind must be project or run' };
    const limit = decimalString(flags['limit-micro-usd']);
    if (typeof limit !== 'string') return limit;
    if (!flags.reason) return { error: 'create budget needs --reason' };
    const body: Record<string, unknown> = { scopeKind: kind, limitMicroUsd: limit, reason: flags.reason };
    if (kind === 'run') {
      if (!flags['run-id']) return { error: 'scope-kind run needs --run-id' };
      body.runId = flags['run-id'];
    }
    return json(body);
  }
  if (p === '/budgets/:budgetId' && m === 'PATCH') {
    const limit = decimalString(flags['limit-micro-usd']);
    if (typeof limit !== 'string') return limit;
    if (!flags.reason) return { error: 'patch budget needs --reason' };
    return json({ limitMicroUsd: limit, reason: flags.reason });
  }

  // ---- stage 6: providers ----
  if (p === '/providers' && m === 'POST') {
    const kind = flags.kind;
    if (kind !== 'openai' && kind !== 'openai_compatible') return { error: '--kind must be openai or openai_compatible' };
    const endpoint = parseJsonFlag(flags['endpoint-policy'], 'endpoint-policy');
    if (!endpoint.ok) return { error: endpoint.error };
    const privacy = parseJsonFlag(flags['privacy-policy'], 'privacy-policy');
    if (!privacy.ok) return { error: privacy.error };
    const body: Record<string, unknown> = {
      kind,
      displayName: positional[0],
      endpointPolicy: endpoint.value,
      privacyPolicy: privacy.value
    };
    if (flags['secret-reference-id']) body.secretReferenceId = flags['secret-reference-id'];
    return json(body);
  }
  if (p === '/providers/:providerId' && m === 'PATCH') {
    const body: Record<string, unknown> = {};
    if (flags['display-name']) body.displayName = flags['display-name'];
    if (flags.enabled) body.enabled = flags.enabled === 'true';
    if (flags['privacy-policy']) {
      const parsed = parseJsonFlag(flags['privacy-policy'], 'privacy-policy');
      if (!parsed.ok) return { error: parsed.error };
      body.privacyPolicy = parsed.value;
    }
    if (flags['secret-reference-id']) body.secretReferenceId = flags['secret-reference-id'];
    if (!Object.keys(body).length) return { error: 'patch provider needs --display-name, --enabled or --privacy-policy' };
    return json(body);
  }
  if (p.endsWith('/discovery')) return json({ probe: flags.probe === 'true', ...(flags['budget-ceiling'] ? { budgetCeilingMicroUsd: flags['budget-ceiling'] } : {}) });

  if (p === '/routing/preview') {
    if (!flags['task-type']) return { error: 'preview routing needs --task-type' };
    if (!flags.classification || !KNOWN_CLASSIFICATIONS.includes(flags.classification)) {
      return { error: '--classification must be public or internal' };
    }
    const caps = flags.capabilities ? flags.capabilities.split(',').map(c => c.trim()).filter(Boolean) : [];
    for (const c of caps) {
      if (!/^[a-z][a-z0-9_.:-]{2,127}$/.test(c)) return { error: `capability "${c}" must match ^[a-z][a-z0-9_.:-]{2,127}$` };
    }
    // budgetCeilingMicroUsd is a decimal string in the contract.
    const budget = flags['budget-ceiling'] ?? '0';
    if (!/^(0|[1-9]\d{0,18})$/.test(budget)) return { error: '--budget-ceiling must be a decimal string' };
    return json({
      taskType: flags['task-type'],
      capabilities: caps,
      estimatedInputTokens: Number(flags['input-tokens'] ?? 1),
      maxOutputTokens: Number(flags['max-output-tokens'] ?? 1),
      classification: flags.classification,
      budgetCeilingMicroUsd: budget
    });
  }

  // Reads and other bodyless routes.
  if (m === 'GET' || m === 'DELETE') return { kind: 'none' };
  return { kind: 'none' };
}
