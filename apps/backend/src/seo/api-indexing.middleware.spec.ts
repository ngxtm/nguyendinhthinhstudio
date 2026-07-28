import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('API indexing middleware contract', () => {
  it('sets an API-wide noindex response header', () => {
    const path = join(__dirname, 'api-indexing.middleware.ts');

    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;

    const source = readFileSync(path, 'utf8');
    expect(source).toMatch(
      /setHeader\(\s*['"]X-Robots-Tag['"]\s*,\s*['"]noindex, nofollow['"]\s*\)/,
    );
  });
});
