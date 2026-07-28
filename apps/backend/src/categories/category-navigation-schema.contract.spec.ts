import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('gallery category navigation schema contract', () => {
  const backendRoot = join(__dirname, '..', '..');
  const schemaPath = join(backendRoot, 'prisma', 'schema.prisma');
  const migrationPath = join(
    backendRoot,
    'prisma',
    'migrations',
    '20260728000100_add_gallery_category_navigation',
    'migration.sql',
  );

  it('persists navigation visibility and order on Category', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    expect(schema).toMatch(/showInNavigation\s+Boolean\s+@default\(false\)/);
    expect(schema).toMatch(/navigationOrder\s+Int\s+@default\(0\)/);
  });

  it('imports the former menu taxonomy in the migration', () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, 'utf8');
    for (const slug of ['collection', 'nu', 'beauty', 'wedding', 'me-bau']) {
      expect(migration).toContain(`'${slug}'`);
    }
  });
});
