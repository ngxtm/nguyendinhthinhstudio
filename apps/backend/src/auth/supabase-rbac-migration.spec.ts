import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Supabase RBAC migration compatibility', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/20260715000100_add_supabase_admin_rbac/migration.sql',
    ),
    'utf8',
  );

  it('does not ALTER ROLE attributes that managed Supabase reserves for superusers', () => {
    expect(migration).not.toMatch(/\bALTER\s+ROLE\b/i);
  });

  it('creates the hook reader as a non-login least-privilege role', () => {
    expect(migration).toMatch(
      /CREATE\s+ROLE\s+auth_hook_user_role_reader\s+NOLOGIN[\s\S]*?NOBYPASSRLS/i,
    );
  });

  it('temporarily permits ownership transfer without retaining SET ROLE capability', () => {
    const grantMembership = migration.search(
      /GRANT\s+auth_hook_user_role_reader\s+TO[\s\S]*?session_user/i,
    );
    const createOwnedSchema = migration.search(
      /CREATE\s+SCHEMA\s+auth_hooks\s+AUTHORIZATION\s+auth_hook_user_role_reader/i,
    );
    const transferFunction = migration.search(
      /ALTER\s+FUNCTION\s+auth_hooks\.custom_access_token_hook\(jsonb\)\s+OWNER\s+TO\s+auth_hook_user_role_reader/i,
    );
    const revokeMembership = migration.search(
      /REVOKE\s+auth_hook_user_role_reader\s+FROM[\s\S]*?session_user/i,
    );

    expect(grantMembership).toBeGreaterThanOrEqual(0);
    expect(grantMembership).toBeLessThan(createOwnedSchema);
    expect(transferFunction).toBeGreaterThan(createOwnedSchema);
    expect(revokeMembership).toBeGreaterThan(transferFunction);
  });

  it('does not try to revoke privileges on managed or system schemas', () => {
    expect(migration).not.toMatch(
      /REVOKE\s+CREATE\s+ON\s+SCHEMA\s+%I\s+FROM\s+auth_hook_user_role_reader/i,
    );
    expect(migration).toMatch(
      /(?:pg_catalog\.)?has_schema_privilege\s*\([\s\S]*?'auth_hook_user_role_reader'[\s\S]*?'CREATE'[\s\S]*?\)/i,
    );
  });

  it('can resume after the already-applied prefix of a failed production attempt', () => {
    expect(migration).toMatch(
      /IF\s+NOT\s+EXISTS[\s\S]*?CREATE\s+TYPE\s+public\.app_role/i,
    );
    expect(migration).toMatch(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.user_roles/i,
    );
    expect(migration).toMatch(
      /DROP\s+POLICY\s+IF\s+EXISTS\s+auth_hook_subject_role_lookup\s+ON\s+public\.user_roles/i,
    );
  });

  it('keeps temporary membership changes atomic', () => {
    expect(migration.trimStart()).toMatch(/^BEGIN;/i);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/i);
  });
});
