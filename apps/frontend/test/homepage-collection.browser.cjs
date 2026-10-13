const { test } = require('node:test')
const assert = require('node:assert/strict')
const { build } = require('esbuild')
const { chromium, expect } = require('@playwright/test')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const postcss = require('postcss')

test(
  'homepage selection: search, paging, keyboard, save, errors, stale albums and mobile',
  { timeout: 90000 },
  async () => {
    const root = path.resolve(__dirname, '..')
    const css = await postcss([require('@tailwindcss/postcss')({ base: root })]).process(
      await readFile(path.join(root, 'src/app/globals.css'), 'utf8'),
      { from: path.join(root, 'src/app/globals.css') }
    )
    const normalize = value =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .trim()
    const names = [
      'Nàng Sen',
      'Ngày bên biển',
      'Mùa yêu',
      'Nắng tháng tư',
      'Đường Nắng',
      ...Array.from({ length: 17 }, (_, i) => `Bộ ảnh ${i + 6}`)
    ]
    const albums = names.map((title, i) => ({
      id: String(i),
      title,
      slug: `album-${i}`,
      description: null,
      categories: [{ name: 'Beauty' }],
      coverImage: {
        id: `cover-${i}`,
        filename: 'cover.webp',
        orderIndex: 0,
        thumbnailUrl: '/cover.svg',
        smallUrl: '/cover.svg'
      }
    }))
    let savedIds = ['0', '1', '2']
    let missing = false
    let failSave = false
    let failSearch = false
    const searches = []
    const writes = []
    const configuration = () => ({
      configured: true,
      albumIds: savedIds,
      albums: savedIds.flatMap(id => (missing && id === savedIds[0] ? [] : [albums.find(a => a.id === id)]))
    })
    const bundle = await build({
      absWorkingDir: root,
      bundle: true,
      write: false,
      platform: 'browser',
      jsx: 'automatic',
      stdin: {
        contents:
          "import React from 'react'; import {createRoot} from 'react-dom/client'; import {Toaster} from 'sonner'; import Page from './src/app/admin/homepage/page'; createRoot(document.getElementById('root')).render(<><Page/><Toaster/></>);",
        resolveDir: root,
        loader: 'tsx'
      },
      plugins: [
        {
          name: 'homepage-api-fixture',
          setup(build) {
            build.onResolve({ filter: /^@\/lib\/api\/homepage-collection$/ }, () => ({
              path: 'api',
              namespace: 'fixture'
            }))
            build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
              contents: `
            async function request(url, options) {
              const response = await fetch(url, options); const result = await response.json();
              if (!response.ok) {const error = new Error(result.message); error.data = result; throw error;}
              return result;
            }
            export const getHomepageCollectionConfiguration = signal => request('/configuration', {signal});
            export const searchHomepageCollectionAlbums = (search,page,signal) => request('/search?' + new URLSearchParams({search,page}), {signal});
            export const saveHomepageCollection = albumIds => request('/save', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({albumIds})});
          `,
              loader: 'js',
              resolveDir: root
            }))
          }
        }
      ]
    })
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname === '/bundle.js') {
        res.setHeader('Content-Type', 'text/javascript')
        res.end(bundle.outputFiles[0].text)
        return
      }
      if (url.pathname === '/style.css') {
        res.setHeader('Content-Type', 'text/css')
        res.end(css.css)
        return
      }
      if (url.pathname === '/cover.svg') {
        res.setHeader('Content-Type', 'image/svg+xml')
        res.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300"><rect width="240" height="300" fill="#e2e8f0"/></svg>'
        )
        return
      }
      if (url.pathname === '/configuration') {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(configuration()))
        return
      }
      if (url.pathname === '/search') {
        const search = url.searchParams.get('search') || ''
        const page = Number(url.searchParams.get('page'))
        searches.push({ search, page })
        res.setHeader('Content-Type', 'application/json')
        if (failSearch) {
          failSearch = false
          res.statusCode = 503
          res.end(JSON.stringify({ message: 'Không thể tìm bộ ảnh. Hãy thử lại.' }))
          return
        }
        const found = albums.filter(a => normalize(a.title).includes(normalize(search)))
        if (search === 'sen') await new Promise(resolve => setTimeout(resolve, 650))
        res.end(
          JSON.stringify({
            albums: found.slice((page - 1) * 20, page * 20),
            pagination: { page, hasMore: found.length > page * 20 }
          })
        )
        return
      }
      if (url.pathname === '/save') {
        let body = ''
        for await (const chunk of req) body += chunk
        res.setHeader('Content-Type', 'application/json')
        if (failSave) {
          failSave = false
          res.statusCode = 400
          res.end(JSON.stringify({ message: 'Bộ ảnh đã thay đổi. Hãy chọn bộ ảnh khác.' }))
          return
        }
        savedIds = JSON.parse(body).albumIds
        writes.push([...savedIds])
        res.end(JSON.stringify(configuration()))
        return
      }
      res.setHeader('Content-Type', 'text/html')
      res.end(
        '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><body><main id="root" style="max-width:1100px;margin:auto;padding:16px"></main><script src="/bundle.js"></script></body></html>'
      )
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    let browser
    try {
      browser = await chromium.launch({ headless: true })
      const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      const origin = `http://127.0.0.1:${server.address().port}`
      await page.goto(origin)
      await expect(page.getByRole('button', { name: 'Chọn bộ ảnh cho vị trí 1: Nàng Sen' })).toBeVisible()
      assert.equal(searches.length, 0, 'search loads only when a picker opens')
      await expect(page.getByText('Xem trước', { exact: true })).toHaveCount(0)
      const save = page.getByRole('button', { name: 'Lưu thay đổi', exact: true })
      await expect(save).toBeDisabled()
      await page.getByRole('button', { name: 'Chọn bộ ảnh cho vị trí 1: Nàng Sen' }).click()
      const input = page.getByRole('combobox', { name: 'Tìm bộ ảnh theo tên' })
      await expect(input).toBeFocused()
      await expect(page.getByRole('option', { name: /Ngày bên biển/ })).toHaveAttribute('aria-disabled', 'true')
      await page.getByRole('button', { name: 'Tiếp', exact: true }).click()
      await expect(page.getByText('Trang 2', { exact: true })).toBeVisible()
      await expect(page.getByRole('option')).toHaveCount(2)
      await input.fill('nang')
      await expect(page.getByRole('option', { name: /Nắng tháng tư/ })).toBeVisible()
      await expect(page.getByRole('option')).toHaveCount(3)
      await page.getByRole('option', { name: /Nắng tháng tư/ }).click()
      await expect(page.getByRole('button', { name: 'Chọn bộ ảnh cho vị trí 1: Nắng tháng tư' })).toBeFocused()
      await expect(input).toHaveCount(0)
      await page.getByRole('button', { name: 'Đưa bộ ảnh ở vị trí 2 lên trước' }).click()
      await expect(page.getByRole('button', { name: 'Chọn bộ ảnh cho vị trí 1: Ngày bên biển' })).toBeVisible()
      await page.getByRole('button', { name: 'Hủy thay đổi', exact: true }).click()
      await expect(save).toBeDisabled()
      await page.getByRole('button', { name: 'Chọn bộ ảnh cho vị trí 1: Nàng Sen' }).click()
      await input.fill('duong')
      await expect(page.getByRole('option', { name: /Đường Nắng/ })).toBeVisible()
      await input.press('ArrowDown')
      await input.press('Enter')
      await expect(page.getByRole('button', { name: 'Chọn bộ ảnh cho vị trí 1: Đường Nắng' })).toBeVisible()
      await save.click()
      await expect(save).toBeDisabled()
      assert.deepEqual(writes, [['4', '1', '2']])
      await page.reload()
      await expect(page.getByRole('button', { name: 'Chọn bộ ảnh cho vị trí 1: Đường Nắng' })).toBeVisible()

      await page.getByRole('button', { name: 'Chọn bộ ảnh cho vị trí 1: Đường Nắng' }).click()
      await input.fill('sen')
      await expect.poll(() => searches.some(value => value.search === 'sen')).toBe(true)
      await input.fill('nang')
      await expect(page.getByRole('option')).toHaveCount(3)
      await expect(page.getByRole('option', { name: /Đường Nắng/ })).toBeVisible()
      await input.fill('khong-co-bo-anh')
      await expect(page.getByText('Không tìm thấy bộ ảnh. Thử tên khác.')).toBeVisible()
      await input.press('Escape')
      await expect(input).toHaveCount(0)

      failSearch = true
      await page.getByRole('button', { name: 'Chọn bộ ảnh cho vị trí 1: Đường Nắng' }).click()
      await expect(page.getByRole('alert')).toContainText('Không thể tìm bộ ảnh')
      await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
      await expect(page.getByRole('option', { name: /Nắng tháng tư/ })).toBeVisible()
      await page.getByRole('option', { name: /Nắng tháng tư/ }).click()
      failSave = true
      await save.click()
      await expect(page.getByText('Bộ ảnh đã thay đổi. Hãy chọn bộ ảnh khác.', { exact: true })).toBeVisible()
      await expect(save).toBeEnabled()
      await expect(page.getByRole('button', { name: 'Chọn bộ ảnh cho vị trí 1: Nắng tháng tư' })).toBeVisible()
      assert.deepEqual(savedIds, ['4', '1', '2'])
      await page.getByRole('button', { name: 'Hủy thay đổi', exact: true }).click()

      await page.setViewportSize({ width: 320, height: 900 })
      await page.getByRole('button', { name: 'Chọn bộ ảnh cho vị trí 1: Đường Nắng' }).click()
      await expect(input).toBeFocused()
      const bounds = await input.boundingBox()
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320, 'search fits the mobile viewport')
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'page has no horizontal overflow'
      )
      await page.getByRole('button', { name: 'Bỏ chọn vị trí này', exact: true }).click()
      await expect(save).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Chọn bộ ảnh cho vị trí 1: Chưa chọn' })).toBeVisible()
      missing = true
      await page.reload()
      await expect(page.getByRole('alert')).toContainText('Một bộ ảnh đã bị ẩn, xóa hoặc mất ảnh bìa')
      await expect(save).toBeDisabled()
      if (process.env.HOMEPAGE_COLLECTION_SCREENSHOT)
        await page.screenshot({ path: process.env.HOMEPAGE_COLLECTION_SCREENSHOT, fullPage: true })
      assert.deepEqual(errors, [])
    } finally {
      if (browser) await browser.close()
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    }
  }
)
