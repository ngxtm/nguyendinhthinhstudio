import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { execFile, spawn } from 'child_process';
import { mkdir, readFile, rename } from 'fs/promises';
import { dirname, basename, extname, resolve } from 'path';
import { promisify } from 'util';
import { deflateSync } from 'zlib';
import { ImageUrlService } from '../src/images/image-url.service';
import { validateEnv } from '../src/config/env.validation';

const execFileAsync = promisify(execFile);
const objectCount = 10;
const requestConcurrency = 2;

type Arguments = {
  container: string;
  evidence: string;
  source?: string;
};

type ContainerState = {
  Running: boolean;
  OOMKilled: boolean;
};

type DockerStats = {
  MemPerc?: string;
  MemUsage?: string;
};

type MemorySample = {
  timestamp: string;
  memoryPercent: number;
  memoryUsage: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseArguments(args: string[]): Arguments {
  const values = new Map<string, string>();
  for (const arg of args) {
    const match = /^--([^=]+)=(.+)$/.exec(arg);
    if (match) {
      values.set(match[1], match[2]);
    }
  }

  const container = values.get('container') ?? 'imgproxy';
  const evidence = values.get('evidence') ?? 'artifacts/imgproxy-cold-cache.json';
  const source = values.get('source') ?? process.env.IMGPROXY_LOAD_SOURCE_PATH;

  return { container, evidence, source };
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.allocUnsafe(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return chunk;
}

function createDefaultMaximumResolutionPng(): Buffer {
  const width = 7071;
  const height = 7071;
  const scanlineLength = 1 + width * 4;
  const pixels = Buffer.alloc(scanlineLength * height);
  const header = Buffer.allocUnsafe(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: getRequiredEnv('R2_S3_ENDPOINT'),
    credentials: {
      accessKeyId: getRequiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
}

function contentTypeFor(filename: string): string {
  const extension = extname(filename).toLowerCase();
  const types: Record<string, string> = {
    '.avif': 'image/avif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  const contentType = types[extension];
  if (!contentType) {
    throw new Error(`Unsupported load-test image extension: ${extension}`);
  }
  return contentType;
}

async function inspectContainer(container: string): Promise<{ state: ContainerState; restartCount: number }> {
  const [stateResult, restartResult] = await Promise.all([
    execFileAsync('docker', ['inspect', container, '--format', '{{json .State}}']),
    execFileAsync('docker', ['inspect', container, '--format', '{{.RestartCount}}']),
  ]);

  return {
    state: JSON.parse(stateResult.stdout.trim()) as ContainerState,
    restartCount: Number.parseInt(restartResult.stdout.trim(), 10),
  };
}

function startTelemetry(container: string): {
  samples: MemorySample[];
  waitForFirstSample: () => Promise<void>;
  stop: () => Promise<void>;
} {
  const samples: MemorySample[] = [];
  const telemetry = spawn('docker', ['stats', container, '--format', '{{json .}}'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let firstSampleResolve: (() => void) | undefined;
  let firstSampleReject: ((reason: Error) => void) | undefined;
  const firstSample = new Promise<void>((resolvePromise, rejectPromise) => {
    firstSampleResolve = resolvePromise;
    firstSampleReject = rejectPromise;
  });

  telemetry.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
    const lines = output.split(/\r?\n/);
    output = lines.pop() ?? '';

    for (const line of lines) {
      try {
        const stats = JSON.parse(line) as DockerStats;
        const memoryPercent = Number.parseFloat(stats.MemPerc ?? '');
        if (!Number.isFinite(memoryPercent) || !stats.MemUsage) {
          continue;
        }
        samples.push({
          timestamp: new Date().toISOString(),
          memoryPercent,
          memoryUsage: stats.MemUsage,
        });
        firstSampleResolve?.();
        firstSampleResolve = undefined;
      } catch {
        // Ignore non-JSON docker output and keep collecting telemetry.
      }
    }
  });

  telemetry.once('error', (error) => firstSampleReject?.(error));
  telemetry.once('exit', (code) => {
    if (samples.length === 0) {
      firstSampleReject?.(new Error(`docker stats exited before returning telemetry (code ${code})`));
    }
  });

  return {
    samples,
    waitForFirstSample: () =>
      Promise.race([
        firstSample,
        new Promise<void>((_, rejectPromise) => {
          setTimeout(() => rejectPromise(new Error('Timed out waiting for docker stats telemetry')), 15_000);
        }),
      ]),
    stop: () =>
      new Promise<void>((resolvePromise) => {
        if (telemetry.exitCode !== null) {
          resolvePromise();
          return;
        }
        telemetry.once('exit', () => resolvePromise());
        telemetry.kill('SIGTERM');
      }),
  };
}

async function runConcurrent<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: requestConcurrency }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await work(item);
    }
  });
  await Promise.all(workers);
}

function percentile(values: number[], percentage: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil((percentage / 100) * sorted.length) - 1)];
}

async function writeEvidence(path: string, evidence: object): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await import('fs/promises').then(({ writeFile }) => writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`));
  await rename(temporary, target);
}

async function main(): Promise<void> {
  validateEnv(process.env);
  const args = parseArguments(process.argv.slice(2));
  const sourcePath = args.source ? resolve(args.source) : undefined;
  const sourceBody = sourcePath
    ? await readFile(sourcePath)
    : createDefaultMaximumResolutionPng();
  const sourceName = sourcePath ? basename(sourcePath) : 'generated-50mp.png';
  const contentType = contentTypeFor(sourceName);
  const bucket = getRequiredEnv('CLOUDFLARE_R2_BUCKET_NAME');
  const r2 = createR2Client();
  const imageUrl = new ImageUrlService(new ConfigService(process.env));
  const runId = `${Date.now()}-${process.pid}`;
  const objectKeys = Array.from(
    { length: objectCount },
    (_, index) => `smoke/imgproxy-cold-cache/${runId}/${index}-${sourceName}`,
  );
  const before = await inspectContainer(args.container);
  const telemetry = startTelemetry(args.container);
  const startedAt = new Date().toISOString();
  const timings: number[] = [];
  const statusCounts: Record<string, number> = {};
  const bodySizes: number[] = [];
  let after: Awaited<ReturnType<typeof inspectContainer>> | undefined;
  let requestError: unknown;

  try {
    await Promise.all(
      objectKeys.map((key) =>
        r2.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: sourceBody,
            ContentType: contentType,
          }),
        ),
      ),
    );

    await telemetry.waitForFirstSample();
    await runConcurrent(objectKeys, async (key) => {
      const started = performance.now();
      const response = await fetch(imageUrl.getSignedUrl(key, 1920, 1920));
      const body = await response.arrayBuffer();
      timings.push(performance.now() - started);
      statusCounts[String(response.status)] = (statusCounts[String(response.status)] ?? 0) + 1;
      bodySizes.push(body.byteLength);

      if (response.status !== 200 || response.headers.get('content-type') !== 'image/webp' || body.byteLength === 0) {
        throw new Error(`imgproxy request for ${key} failed with HTTP ${response.status}, ${response.headers.get('content-type')}, ${body.byteLength} bytes`);
      }
    });
  } catch (error) {
    requestError = error;
  } finally {
    await telemetry.stop();
    after = await inspectContainer(args.container);
    await Promise.allSettled(
      objectKeys.map((key) => r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))),
    );
  }

  const peakMemorySample = telemetry.samples.reduce<MemorySample | undefined>(
    (peak, sample) => !peak || sample.memoryPercent > peak.memoryPercent ? sample : peak,
    undefined,
  );
  const peakMemoryPercent = peakMemorySample?.memoryPercent ?? null;
  const peakMemoryUsage = peakMemorySample?.memoryUsage ?? null;
  const evidence = {
    startedAt,
    finishedAt: new Date().toISOString(),
    requests: { total: objectKeys.length, successful: timings.length },
    p50Ms: percentile(timings, 50),
    p95Ms: percentile(timings, 95),
    statusCounts,
    bodySizes,
    samples: telemetry.samples,
    peakMemoryPercent,
    peakMemoryUsage,
    memoryLimit: (() => {
      const memoryParts = peakMemorySample?.memoryUsage.split('/') ?? [];
      return memoryParts[memoryParts.length - 1]?.trim();
    })(),
    restartCount: { before: before.restartCount, after: after!.restartCount },
    oomKilled: { before: before.state.OOMKilled, after: after!.state.OOMKilled },
    containerRunning: after!.state.Running,
  };
  await writeEvidence(args.evidence, evidence);

  if (
    requestError ||
    telemetry.samples.length === 0 ||
    timings.length !== objectKeys.length ||
    peakMemoryPercent === null ||
    peakMemoryPercent >= 80 ||
    after!.state.OOMKilled ||
    !after!.state.Running ||
    after!.restartCount !== before.restartCount
  ) {
    throw requestError ?? new Error(`Cold-cache imgproxy load test failed; inspect ${args.evidence}`);
  }

  console.log(`Cold-cache load test passed: p50=${evidence.p50Ms!.toFixed(1)}ms, p95=${evidence.p95Ms!.toFixed(1)}ms, peak memory=${peakMemoryPercent.toFixed(2)}%`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
