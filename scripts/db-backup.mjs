// @ts-check
import { createEncryptedDatabaseBackup } from '../backend/src/platform/database/backup.js';
try {
    const admin = process.env.DATABASE_BACKUP_URL ?? process.env.TEST_DATABASE_ADMIN_URL;
    const target = process.env.MIGRATION_DATABASE_URL;
    if (!admin || !target) throw new Error('Backup configuration is required.');
    const url = new URL(admin);
    url.pathname = new URL(target).pathname;
    const destination = await createEncryptedDatabaseBackup(url.href);
    process.stdout.write(`Encrypted database backup: ${destination}\n`);
} catch {
    process.stderr.write('Database backup failed. Verify local backup credentials, PostgreSQL tools, and Windows DPAPI access.\n');
    process.exitCode = 1;
}
