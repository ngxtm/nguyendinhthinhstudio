import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const FORBIDDEN_KEY =
    /^(?:access_?token|refresh_?token|token|api_?key|authorization|upload_?url|presigned_?url)$/i;

export function assertJournalSafe(value, path = '$') {
    if (!value || typeof value !== 'object') return value;
    for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_KEY.test(key)) {
            throw new Error(`journal contains forbidden secret material at ${path}.${key}`);
        }
        assertJournalSafe(child, `${path}.${key}`);
    }
    return value;
}

export async function saveJournal(path, journal) {
    assertJournalSafe(journal);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(journal, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
    });
    await rename(temporary, path);
}

export async function loadJournal(path, fallback = null) {
    try {
        const journal = JSON.parse(await readFile(path, 'utf8'));
        assertJournalSafe(journal);
        return journal;
    } catch (error) {
        if (error?.code === 'ENOENT') return fallback;
        throw error;
    }
}
