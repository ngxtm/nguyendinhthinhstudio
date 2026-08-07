import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../src/app/(public)/thu-vien/[slug]/AlbumDetailClient.tsx', import.meta.url),
  'utf8'
)
const statsMarkup = source.match(/\{\/\* Stats \*\/\}([\s\S]*?)\{\/\* Category Badges \*\/\}/)?.[1]

test('public album detail keeps the image count but hides the view count', () => {
  assert.ok(statsMarkup, 'album stats markup must remain present')
  assert.match(statsMarkup, /<ImageIcon[\s\S]*?\/>\s*\{album\.imageCount\} ảnh/)
  assert.doesNotMatch(statsMarkup, /viewCount|lượt xem|<Eye/)
})

test('public album detail does not render the shoot date', () => {
  assert.doesNotMatch(source, /Calendar|formatDate|album\.shootDate|Ngày chụp/)
})

test('album detail stats wrap complete items without a bullet separator', () => {
  assert.ok(statsMarkup, 'album stats markup must remain present')
  assert.match(statsMarkup, /className="[^"]*flex-wrap[^"]*gap-x-3[^"]*gap-y-2[^"]*"/)
  assert.match(statsMarkup, /className="inline-flex items-center gap-1 whitespace-nowrap"/)
  assert.doesNotMatch(statsMarkup, /•/)
})
