import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createReleaseFingerprint(commitSha) {
    if (!/^[a-f0-9]{40}$/.test(commitSha)) {
        throw new Error('release fingerprint requires one 40-character lowercase Git commit');
    }
    return `sha256:${createHash('sha256').update(commitSha, 'utf8').digest('hex')}`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    if (process.argv.length !== 3) {
        process.stderr.write('expected exactly one full Git commit\n');
        process.exitCode = 1;
    } else {
        try {
            process.stdout.write(`${createReleaseFingerprint(process.argv[2])}\n`);
        } catch (error) {
            process.stderr.write(
                `${error instanceof Error ? error.message : 'release fingerprint failed'}\n`,
            );
            process.exitCode = 1;
        }
    }
}
