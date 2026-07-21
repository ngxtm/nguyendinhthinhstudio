import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { IMAGE_GRAMMAR_FIXTURES } from '@ndt/image-upload-policy';
import { ImageUploadPolicyService } from './image-upload-policy.service';
import {
  StoredImageInspectionError,
  StoredImageInspectorService,
} from './stored-image-inspector.service';

async function validPng(): Promise<Uint8Array> {
  const encoded = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  }).png().toBuffer();
  // Sharp emits a pHYs chunk by default; stored policy treats it as
  // source-only metadata, so remove that chunk while preserving all others.
  const chunks: Uint8Array[] = [encoded.subarray(0, 8)];
  let offset = 8;
  while (offset < encoded.byteLength) {
    const length = encoded.readUInt32BE(offset);
    const end = offset + 12 + length;
    const type = Buffer.from(encoded.subarray(offset + 4, offset + 8)).toString('ascii');
    if (type !== 'pHYs') chunks.push(encoded.subarray(offset, end));
    offset = end;
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    result.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return result;
}

async function fixtureBytes(category: 'orientation' | 'wide-gamut', id?: string): Promise<Uint8Array> {
  const fixture = IMAGE_GRAMMAR_FIXTURES.find((item) => item.category === category && (!id || item.id === id))!;
  for await (const bytes of fixture.input()) return bytes;
  throw new Error('fixture is empty');
}

describe('StoredImageInspectorService', () => {
  it('hashes once, validates stored grammar, and completes a Sharp decode', async () => {
    const bytes = await validPng();
    const policy = new ImageUploadPolicyService().getPolicy().policy;
    const result = await new StoredImageInspectorService().inspect(
      bytes,
      policy,
      'image/png',
    );

    expect(result.byteSize).toBe(bytes.byteLength);
    expect(result.digestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.digestSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(result.facts.mime).toBe('image/png');
  });

  it('rejects malformed and trailing bytes before Sharp can accept them', async () => {
    const bytes = await validPng();
    const policy = new ImageUploadPolicyService().getPolicy().policy;
    const trailing = new Uint8Array(bytes.byteLength + 1);
    trailing.set(bytes);
    trailing[trailing.length - 1] = 0;
    await expect(new StoredImageInspectorService().inspect(trailing, policy)).rejects.toMatchObject({ code: 'image_trailing_bytes' });
    const malformed = bytes.slice();
    malformed[malformed.length - 1] ^= 0xff;
    await expect(new StoredImageInspectorService().inspect(malformed, policy)).rejects.toBeInstanceOf(StoredImageInspectionError);
  });

  it('enforces dimensions and rejects source-only metadata', async () => {
    const policy = new ImageUploadPolicyService().getPolicy().policy;
    const oversized = await sharp({ create: { width: policy.maxWidth + 1, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
    await expect(new StoredImageInspectorService().inspect(oversized, policy)).rejects.toMatchObject({ code: 'image_invalid_dimensions' });
    const withMetadata = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
    await expect(new StoredImageInspectorService().inspect(withMetadata, policy)).rejects.toMatchObject({ code: 'image_metadata_not_allowed' });
  });

  it('rejects animation/pages and orientation metadata', async () => {
    const policy = new ImageUploadPolicyService().getPolicy().policy;
    const animated = await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), {
      raw: { width: 1, height: 2, channels: 3, pageHeight: 1 },
    }).webp({ loop: 0 }).toBuffer();
    await expect(new StoredImageInspectorService().inspect(animated, policy)).rejects.toMatchObject({ code: 'image_animation_not_allowed' });
    const oriented = await fixtureBytes('orientation');
    await expect(new StoredImageInspectorService().inspect(oriented, policy)).rejects.toMatchObject({ code: 'image_metadata_not_allowed' });
  });

  it('enforces the closed ICC allowlist before decode', async () => {
    const policy = new ImageUploadPolicyService().getPolicy().policy;
    const unapprovedIcc = await fixtureBytes('wide-gamut', 'png-wide-gamut-icc');
    await expect(new StoredImageInspectorService().inspect(unapprovedIcc, policy)).rejects.toMatchObject({ code: 'image_invalid_icc' });
  });

  it('rejects MIME spoofing and bounded body overflow before decode', async () => {
    const bytes = await validPng();
    const policy = new ImageUploadPolicyService().getPolicy().policy;

    await expect(
      new StoredImageInspectorService().inspect(bytes, policy, 'image/webp'),
    ).rejects.toMatchObject({ code: 'image_unsupported_format' });

    await expect(
      new StoredImageInspectorService().inspect(
        new Uint8Array(5_242_881),
        policy,
      ),
    ).rejects.toBeInstanceOf(StoredImageInspectionError);
  });
});
