import { createHash } from 'node:crypto'
import sharp from 'sharp'
import {
  StoredImageInspectionError,
  StoredImageInspectorService,
} from './stored-image-inspector.service'

async function webpBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: 3,
      height: 2,
      channels: 4,
      background: { r: 10, g: 20, b: 30, alpha: 0.5 },
    },
  })
    .webp()
    .toBuffer()
}

describe('StoredImageInspectorService', () => {
  it('accepts an actual WebP after metadata and full raw decode', async () => {
    const bytes = await webpBuffer()

    await expect(new StoredImageInspectorService().inspect(bytes)).resolves.toEqual({
      byteSize: bytes.byteLength,
      digestSha256: createHash('sha256').update(bytes).digest('hex'),
      facts: { mime: 'image/webp', width: 3, height: 2 },
    })
  })

  it.each([
    ['a non-WebP object', async () => sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } }).png().toBuffer()],
    ['a truncated WebP object', async () => (await webpBuffer()).subarray(0, 16)],
    ['an object above five MiB', async () => new Uint8Array(5 * 1024 * 1024 + 1)],
  ])('rejects %s as upload_decode_failed', async (_name, createBytes) => {
    await expect(
      new StoredImageInspectorService().inspect(await createBytes()),
    ).rejects.toMatchObject({
      code: 'upload_decode_failed',
    } satisfies Partial<StoredImageInspectionError>)
  })
})
