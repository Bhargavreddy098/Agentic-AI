// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
    reviewedMigrationPlan as canonical,
    MIGRATION_CHECKSUM_MANIFEST,
} from '../database/migrate.js';
import { reviewedMigrationPlan as compatibility } from '../../scripts/apply-migrations.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('all retained migrations retain their captured SHA-256 bytes', () => {
    const entries = Object.entries(MIGRATION_CHECKSUM_MANIFEST);
    assert.equal(entries.length, 15);
    for (const [relativePath, expectedDigest] of entries) {
        const fullPath = resolve(root, relativePath);
        assert.equal(existsSync(fullPath), true, `Missing migration ${relativePath}`);
        const actualDigest = createHash('sha256').update(readFileSync(fullPath)).digest('hex');
        assert.equal(actualDigest, expectedDigest, relativePath);
    }
});

test('old and new migration entry points resolve the same reviewed closure', () => {
    assert.deepEqual(compatibility({ root, target: 'M04' }), canonical({ root, target: 'M04' }));
    assert.deepEqual(
        canonical({ root, target: 'M04' }).map(item => item.file),
        ['001-control.sql', '009-identity-grants.sql', '010-control-qualification.sql']
    );
});

test('modular backend and internal workspace packages preserve explicit package identities without legacy microservice proliferation', () => {
    const rootPkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    assert.equal(rootPkg.name, 'asi-backend');
    assert.equal(rootPkg.type, 'module');

    const contractsPkg = JSON.parse(readFileSync(resolve(root, 'packages/contracts/package.json'), 'utf8'));
    assert.equal(contractsPkg.name, '@asi/contracts');

    const gatewayPkg = JSON.parse(readFileSync(resolve(root, 'backend/modules/gateway/package.json'), 'utf8'));
    assert.equal(gatewayPkg.name, '@asi/gateway');
});

