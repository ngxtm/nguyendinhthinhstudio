import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const modulePath = new URL('../src/lib/public-navigation.ts', import.meta.url)

test('public navigation maps the database category tree to canonical gallery URLs', async () => {
  assert.equal(existsSync(modulePath), true, 'public-navigation.ts must exist')
  if (!existsSync(modulePath)) return

  const { buildPublicNavigation } = await import(modulePath.href)
  const navigation = buildPublicNavigation([
    {
      id: 'nu',
      name: 'Nữ',
      slug: 'nu',
      parentId: null,
      albumCount: 2,
      navigationOrder: 10,
      updatedAt: '2026-07-28T00:00:00.000Z',
      children: [
        {
          id: 'beauty',
          name: 'Beauty',
          slug: 'beauty',
          parentId: 'nu',
          albumCount: 1,
          navigationOrder: 20,
          updatedAt: '2026-07-28T00:00:00.000Z',
          children: []
        }
      ]
    }
  ])

  const gallery = navigation.find((item: { href: string }) => item.href === '/thu-vien')
  assert.ok(gallery)
  assert.deepEqual(gallery.children, [
    {
      href: '/thu-vien/danh-muc/nu',
      label: 'Nữ',
      children: [{ href: '/thu-vien/danh-muc/beauty', label: 'Beauty' }]
    }
  ])
})

test('category calls to action fall back to the main gallery until a category is public', async () => {
  assert.equal(existsSync(modulePath), true, 'public-navigation.ts must exist')
  if (!existsSync(modulePath)) return

  const { categoryHref } = await import(modulePath.href)
  const publicSlugs = new Set(['beauty'])

  assert.equal(categoryHref('beauty', publicSlugs), '/thu-vien/danh-muc/beauty')
  assert.equal(categoryHref('me-bau', publicSlugs), '/thu-vien')
})
