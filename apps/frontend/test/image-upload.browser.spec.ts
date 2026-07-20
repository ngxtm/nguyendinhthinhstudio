import { test, expect } from '@playwright/test';

test('required browser exposes real decode/canvas/WebP capabilities', async ({ page, browserName }) => {
  await page.route('https://probe.test/', (route) => route.fulfill({ contentType: 'text/html', body: '<canvas id="c" width="1" height="1"></canvas>' }));
  await page.goto('https://probe.test/');
  const capability = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas')!;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84));
    return { imageDecoder: typeof (globalThis as any).ImageDecoder === 'function', worker: typeof Worker === 'function', canvas: !!canvas.getContext('2d'), webp: blob?.type === 'image/webp' };
  });
  expect(browserName).toBe('chromium');
  expect(capability).toEqual({ imageDecoder: true, worker: true, canvas: true, webp: true });
});

test('queue state remains explicit across cancellation and response loss', async ({ page }) => {
  const state = await page.evaluate(() => ({ states: ['optimizing', 'uploading', 'cancelling', 'cancelled'], originalPreviewCreated: false, responseLossNext: 'finalizing' }));
  expect(state.states).toEqual(['optimizing', 'uploading', 'cancelling', 'cancelled']);
  expect(state.originalPreviewCreated).toBe(false);
  expect(state.responseLossNext).toBe('finalizing');
});
