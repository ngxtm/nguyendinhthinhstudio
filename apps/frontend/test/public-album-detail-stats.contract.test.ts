import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../src/app/(public)/thu-vien/[slug]/AlbumDetailClient.tsx', import.meta.url),
  'utf8'
)
const statsMarkup = source.match(/\{\/\* Stats \*\/\}([\s\S]*?)\{\/\* Category Badges \*\/\}/)?.[1]

test('album detail pairs image and view counts with their semantic icons', () => {
  assert.ok(statsMarkup, 'album stats markup must remain present')
  assert.match(statsMarkup, /<ImageIcon[\s\S]*?\/>\s*\{album\.imageCount\} ảnh/)
  assert.match(statsMarkup, /<Eye[\s\S]*?\/>\s*\{formatCompactCount\(album\.viewCount\)\} lượt xem/)
})

test('album detail stats wrap complete items without a bullet separator', () => {
  assert.ok(statsMarkup, 'album stats markup must remain present')
  assert.match(statsMarkup, /className="[^"]*flex-wrap[^"]*gap-x-3[^"]*gap-y-2[^"]*"/)
  assert.match(statsMarkup, /className="inline-flex items-center gap-1 whitespace-nowrap"/)
  assert.doesNotMatch(statsMarkup, /•/)
})
