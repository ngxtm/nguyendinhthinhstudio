import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import sharp from 'sharp';

const EXPECTED_BYTES = 53_114_115;
const EXPECTED_SHA256 =
  '1ac11dd1c64d39e79bdd3682bb11871ee2619b07a86fb923ba8412ab6dc3d581';
const REPOSITORY_ROOT = resolve(__dirname, '../../..');

function outputArgument(argv: readonly string[]): string {
  if (argv.length !== 2 || argv[0] !== '--output' || !argv[1]?.trim()) {
    throw new Error(
      'usage: generate-image-upload-memory-fixture --output <temp-path>',
    );
  }
  return resolve(argv[1]);
}

function assertOutsideRepository(path: string): void {
  const relation = relative(REPOSITORY_ROOT, path);
  if (
    relation === '' ||
    (!relation.startsWith('..') && !relation.includes(':'))
  ) {
    throw new Error('memory fixture output must be outside the repository');
  }
  assert.notEqual(
    dirname(path),
    path,
    'memory fixture output must be a file path',
  );
}

export async function generateMemoryFixture(output: string): Promise<void> {
  assert.equal(
    sharp.versions.sharp,
    '0.35.3',
    'memory fixture requires Sharp 0.35.3',
  );

  const width = 8192;
  const height = 8192;
  const channels = 3;
  const raw = Buffer.allocUnsafe(width * height * channels);
  let state = 0x4e445431 >>> 0;

  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      const noise = state & 31;
      raw[i++] = (x * 3 + y * 5 + noise) & 255;
      raw[i++] = (x * 7 + y * 11 + (noise << 1)) & 255;
      raw[i++] = (x * 13 + y * 17 + (noise << 2)) & 255;
    }
  }

  const jpegOptions = {
    quality: 90,
    chromaSubsampling: '4:2:0',
    progressive: false,
    mozjpeg: false,
    optimiseCoding: false,
  } as const;
  const jpeg = await sharp(raw, {
    raw: { width, height, channels },
  })
    .jpeg(jpegOptions)
    .toBuffer();
  const digest = createHash('sha256').update(jpeg).digest('hex');
  if (jpeg.byteLength !== EXPECTED_BYTES || digest !== EXPECTED_SHA256) {
    throw new Error(
      `deterministic fixture drift: bytes=${jpeg.byteLength} sha256=${digest}`,
    );
  }
  await writeFile(output, jpeg, { flag: 'wx', mode: 0o600 });
  process.stdout.write(
    `fixturePath=${output}\nfixtureBytes=${jpeg.byteLength}\nfixtureSha256=${digest}\n`,
  );
}

async function main(): Promise<void> {
  const output = outputArgument(process.argv.slice(2));
  assertOutsideRepository(output);
  await generateMemoryFixture(output);
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
