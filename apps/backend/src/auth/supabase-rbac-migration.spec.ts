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
});
