import { expect, test, chromium, type Browser } from '@playwright/test'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const EXPECTED_DIGEST = '1ac11dd1c64d39e79bdd3682bb11871ee2619b07a86fb923ba8412ab6dc3d581'
const MAX_OPTIMIZED_DELTA = 536_870_912
const MAX_RATIO = 0.5
const frontendRoot = resolve(__dirname, '../..')

type Measurement = {
  beforeBytes: number
  afterBytes: number
  deltaBytes: number
}

let server: Server | undefined
let origin: string
let bundle: Uint8Array
let fixture: Uint8Array
let temporaryDirectory: string

async function settle(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 250)))
      })
  )
}

async function measure(mode: 'optimized' | 'control'): Promise<Measurement> {
  let browser: Browser | undefined
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: chromium.executablePath(),
      args: ['--enable-precise-memory-info']
    })
    const page = await browser.newPage()
    await page.goto(origin)
    const isolated = await page.evaluate(() => crossOriginIsolated)
    expect(isolated).toBe(true)

    await page.evaluate(async () => {
      const response = await fetch('/fixture')
      if (!response.ok) throw new Error(`fixture fetch failed: ${response.status}`)
      ;(globalThis as any).__ndtFixture = await response.arrayBuffer()
    })

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('HeapProfiler.collectGarbage')
    await settle(page)
    const beforeBytes = await page.evaluate(async () => {
      const measureMemory = (performance as any).measureUserAgentSpecificMemory
      if (typeof measureMemory !== 'function') {
        throw new Error('measureUserAgentSpecificMemory unavailable')
      }
      return (await measureMemory.call(performance)).bytes as number
    })

    if (mode === 'optimized') {
      await page.evaluate(async () => {
        try {
          await (globalThis as any).__ndtRunProductionOptimizer((globalThis as any).__ndtFixture)
        } catch (error) {
          const cause = (error as any)?.cause
          throw new Error(
            `${error instanceof Error ? error.message : String(error)}; cause=${cause?.name ?? 'unknown'}:${cause?.message ?? 'unavailable'}`
          )
        }
      })
    } else {
      await page.evaluate(async () => {
        const source = new Blob([(globalThis as any).__ndtFixture], {
          type: 'image/jpeg'
        })
        const decoded = await createImageBitmap(source)
        const canvas = new OffscreenCanvas(decoded.width, decoded.height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('full-decode control canvas unavailable')
        context.drawImage(decoded, 0, 0)
        const fullDecodedFrame = context.getImageData(0, 0, decoded.width, decoded.height)
        ;(globalThis as any).__ndtHeldControl = {
          source,
          decoded,
          canvas,
          fullDecodedFrame
        }
      })
    }

    await cdp.send('HeapProfiler.collectGarbage')
    await settle(page)
    const afterBytes = await page.evaluate(async () => {
      const result = await (performance as any).measureUserAgentSpecificMemory()
      return result.bytes as number
    })
    const deltaBytes = afterBytes - beforeBytes
    for (const [label, value] of Object.entries({
      beforeBytes,
      afterBytes,
      deltaBytes
    })) {
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${mode} ${label} must be finite and non-negative: ${value}`)
      }
    }
    return { beforeBytes, afterBytes, deltaBytes }
  } finally {
    await browser?.close()
  }
}

test.beforeAll(async () => {
  const fixturePath = process.env.IMAGE_UPLOAD_MEMORY_FIXTURE
  if (!fixturePath) throw new Error('IMAGE_UPLOAD_MEMORY_FIXTURE is required')
  fixture = await readFile(fixturePath)
  const digest = createHash('sha256').update(fixture).digest('hex')
  expect(digest).toBe(EXPECTED_DIGEST)

  temporaryDirectory = await mkdtemp(join(tmpdir(), 'ndt-image-memory-'))
  const bundlePath = join(temporaryDirectory, 'optimizer.js')
  await build({
    absWorkingDir: frontendRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome136',
    outfile: bundlePath,
    stdin: {
      resolveDir: frontendRoot,
      sourcefile: 'image-upload-memory-entry.ts',
      contents: `
        import { INITIAL_IMAGE_UPLOAD_POLICY } from '@ndt/image-upload-policy';
        import { optimizeImage } from './src/lib/image-upload/optimizer';
        import { BoundedImageResourceRegistry } from './src/lib/image-upload/resource-registry';

        globalThis.__ndtRunProductionOptimizer = async (arrayBuffer) => {
          const file = new File([arrayBuffer], 'fixture.jpg', { type: 'image/jpeg' });
          const result = await optimizeImage(
            file,
            INITIAL_IMAGE_UPLOAD_POLICY,
            {
              outcome: 'supported',
              chromiumMajor: 136,
              orientationMode: 'display',
              targetSizeDecode: true,
              webpEncode: true,
              srgbOutput: true,
            },
            new BoundedImageResourceRegistry(),
          );
          const thumbnail = await createImageBitmap(result.blob, {
            resizeWidth: 256,
            resizeHeight: 256,
            resizeQuality: 'high',
          });
          const outputBytes = await result.blob.arrayBuffer();
          globalThis.__ndtHeldOptimized = {
            source: arrayBuffer,
            outputBlob: result.blob,
            outputBytes,
            thumbnail,
          };
        };
      `
    }
  })
  bundle = await readFile(bundlePath)

  const benchmarkServer = createServer((request, response) => {
    const headers = {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cache-Control': 'no-store'
    }
    if (request.url === '/fixture') {
      response.writeHead(200, { ...headers, 'Content-Type': 'image/jpeg' })
      response.end(fixture)
      return
    }
    if (request.url === '/optimizer.js') {
      response.writeHead(200, {
        ...headers,
        'Content-Type': 'application/javascript'
      })
      response.end(bundle)
      return
    }
    response.writeHead(200, { ...headers, 'Content-Type': 'text/html' })
    response.end('<!doctype html><script src="/optimizer.js"></script>')
  })
  server = benchmarkServer
  await new Promise<void>((resolveListen, rejectListen) => {
    benchmarkServer.once('error', rejectListen)
    benchmarkServer.listen(0, '127.0.0.1', resolveListen)
  })
  const address = benchmarkServer.address()
  if (!address || typeof address === 'string') throw new Error('server address unavailable')
  origin = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  if (server) {
    await new Promise<void>((resolveClose, rejectClose) =>
      server?.close(error => (error ? rejectClose(error) : resolveClose()))
    )
  }
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
})

test('production target-size optimizer satisfies the three-process-pair memory gate', async () => {
  test.setTimeout(600_000)
  for (let pair = 1; pair <= 3; pair += 1) {
    const optimized = await measure('optimized')
    const control = await measure('control')
    const optimizedDeltaBytes = optimized.deltaBytes
    const controlDeltaBytes = control.deltaBytes
    const ratio = optimizedDeltaBytes / controlDeltaBytes
    if (!Number.isFinite(ratio) || ratio < 0) {
      throw new Error(`pair ${pair} ratio must be finite and non-negative: ${ratio}`)
    }
    process.stdout.write(
      `${JSON.stringify({
        pair,
        fixtureSha256: EXPECTED_DIGEST,
        optimizedMeasurement: optimized,
        controlMeasurement: control,
        optimizedDeltaBytes,
        controlDeltaBytes,
        ratio
      })}\n`
    )
    expect(optimizedDeltaBytes).toBeLessThanOrEqual(MAX_OPTIMIZED_DELTA)
    expect(optimizedDeltaBytes).toBeLessThanOrEqual(MAX_RATIO * controlDeltaBytes)
  }
})
