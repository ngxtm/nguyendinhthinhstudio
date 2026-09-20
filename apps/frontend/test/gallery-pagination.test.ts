import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addGalleryPageToTitle,
  buildGalleryPageHref,
  parseGalleryPageSearchParams,
  shouldNotFoundGalleryPage
} from '../src/lib/gallery-pagination'

test('treats a missing page query as the canonical first gallery page', () => {
  assert.deepEqual(parseGalleryPageSearchParams({}), { page: 1, explicit: false })
  assert.deepEqual(parseGalleryPageSearchParams({ utm_source: 'newsletter' }), { page: 1, explicit: false })
  assert.equal(buildGalleryPageHref('/thu-vien', 1), '/thu-vien')
  assert.equal(buildGalleryPageHref('/thu-vien', 2), '/thu-vien?page=2')
})

test('accepts only one positive integer scalar page value', () => {
  assert.deepEqual(parseGalleryPageSearchParams({ page: '2' }), { page: 2, explicit: true })

  for (const value of ['0', '-1', '1.5', 'NaN', 'Infinity', '01', '']) {
    assert.throws(
      () => parseGalleryPageSearchParams({ page: value }),
      /Invalid gallery page/
    )
  }

  assert.throws(
    () => parseGalleryPageSearchParams({ page: ['2', '3'] }),
    /Invalid gallery page/
  )
})

test('marks only pages beyond the current catalog as not found, except an empty root page one', () => {
  assert.equal(shouldNotFoundGalleryPage(2, { total: 17, totalPages: 3 }, true), false)
  assert.equal(shouldNotFoundGalleryPage(4, { total: 17, totalPages: 3 }, true), true)
  assert.equal(shouldNotFoundGalleryPage(1, { total: 0, totalPages: 0 }, true), false)
  assert.equal(shouldNotFoundGalleryPage(2, { total: 0, totalPages: 0 }, true), true)
  assert.equal(shouldNotFoundGalleryPage(1, { total: 0, totalPages: 0 }, false), false)
  assert.equal(shouldNotFoundGalleryPage(2, { total: 0, totalPages: 0 }, false), true)
})

test('adds a page suffix without repeating the brand title', () => {
  assert.equal(addGalleryPageToTitle('Thư viện ảnh NDT Studio', 1), 'Thư viện ảnh NDT Studio')
  assert.equal(addGalleryPageToTitle('Thư viện ảnh NDT Studio', 2), 'Thư viện ảnh NDT Studio - Trang 2')
  assert.equal(addGalleryPageToTitle('Beauty | Thư viện ảnh NDT Studio', 3), 'Beauty | Thư viện ảnh NDT Studio - Trang 3')
})
