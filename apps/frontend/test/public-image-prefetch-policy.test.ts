import test from 'node:test'
import assert from 'node:assert/strict'

const modulePath = new URL('../src/lib/public-album-detail-swr.ts', import.meta.url)

test('album image prefetch starts immediately on a normal connection', async () => {
  const { getAlbumImagePrefetchPolicy } = await import(modulePath.href)

  assert.deepEqual(getAlbumImagePrefetchPolicy(), {
    immediate: true,
    rootMargin: '0px 0px 800px 0px'
  })
  assert.deepEqual(getAlbumImagePrefetchPolicy({ effectiveType: '4g', saveData: false }), {
    immediate: true,
    rootMargin: '0px 0px 800px 0px'
  })
})

test('album image prefetch defers on Save-Data and constrained connections', async () => {
  const { getAlbumImagePrefetchPolicy } = await import(modulePath.href)

  for (const connection of [
    { effectiveType: 'slow-2g' },
    { effectiveType: '2g' },
    { effectiveType: '3g' },
    { effectiveType: '4g', saveData: true }
  ]) {
    assert.deepEqual(getAlbumImagePrefetchPolicy(connection), {
      immediate: false,
      rootMargin: '0px 0px 1200px 0px'
    })
  }
})
