const { test } = require('node:test')
const assert = require('node:assert/strict')
const { build } = require('esbuild')
const { chromium, expect } = require('@playwright/test')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const postcss = require('postcss')
require('tsx/cjs')
const { PricingService } = require('../../backend/src/pricing/pricing.service.ts')

async function fixture() {
  const root = path.resolve(__dirname, '..')
  const rows = new Map()
  const prisma = {
    siteSettings: {
      findUnique: async ({ where }) => rows.get(where.key) ?? null,
      create: async ({ data }) => {
        if (rows.has(data.key)) throw { code: 'P2002' }
        rows.set(data.key, { ...data })
        return data
      },
      updateMany: async ({ where, data }) => {
        if (rows.get(where.key)?.value !== where.value) return { count: 0 }
        rows.set(where.key, { key: where.key, ...data })
        return { count: 1 }
      }
    }
  }
  // Run the actual publication service against isolated memory storage; no project database is touched.
  const service = new PricingService(prisma)
  let failWrite = false
  const writes = []
  const css = await postcss([require('@tailwindcss/postcss')({ base: root })]).process(
    await readFile(path.join(root, 'src/app/globals.css'), 'utf8'),
    { from: path.join(root, 'src/app/globals.css') }
  )
  const bundle = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    platform: 'browser',
    jsx: 'automatic',
    stdin: {
      contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {Toaster} from 'sonner';
        import Page from './src/app/admin/pricing/page';
        import Individual from './src/app/(public)/bang-gia/ca-nhan/PriceClient';
        import {getPublishedPricing} from '@/lib/api/pricing';
        const root = createRoot(document.getElementById('root'));
        if (location.pathname.startsWith('/bang-gia/')) {
          getPublishedPricing('ca-nhan').then(data => root.render(<Individual prices={data.prices}/>));
        } else root.render(<main className="mx-auto max-w-7xl p-4 sm:p-8"><Page/><Toaster position="top-right" richColors closeButton duration={3000}/></main>);
      `,
      resolveDir: root,
      loader: 'tsx'
    },
    plugins: [
      {
        name: 'isolated-pricing-api',
        setup(build) {
          build.onResolve({ filter: /^@\/lib\/api\/pricing$/ }, () => ({ path: 'api', namespace: 'fixture' }))
          build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture-link' }))
          build.onLoad({ filter: /.*/, namespace: 'fixture-link' }, () => ({
            contents: "import React from 'react'; export default function Link(props) { return <a {...props}/> }",
            loader: 'jsx',
            resolveDir: root
          }))
          build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents: `
            async function request(url, options) {
              const response = await fetch(url, options); const data = await response.json();
              if (!response.ok) { const error = new Error(data.message); error.data = data; error.status = response.status; throw error; }
              return data;
            }
            export const getAdminPricing = (category, signal) => request('/pricing/admin/'+category, {signal});
            export const getPublishedPricing = category => request('/pricing/'+category, {cache:'no-store'});
            export const savePricingDraft = (category, input) => request('/pricing/admin/'+category+'/draft', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(input)});
            export const publishPricing = (category, input) => request('/pricing/admin/'+category+'/publish', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(input)});
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
    if (url.pathname.startsWith('/pricing/')) {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      try {
        const segments = url.pathname.split('/').filter(Boolean)
        if (segments[1] !== 'admin') {
          res.end(JSON.stringify(await service.getPublished(segments[1])))
          return
        }
        const category = segments[2]
        if (req.method === 'GET') {
          res.end(JSON.stringify(await service.getConfiguration(category)))
          return
        }
        let raw = ''
        for await (const chunk of req) raw += chunk
        const input = JSON.parse(raw)
        writes.push({ category, action: segments[3], ...input })
        if (failWrite) {
          failWrite = false
          throw { status: 503, message: 'Chưa thể lưu bảng giá. Hãy thử lại.' }
        }
        res.end(JSON.stringify(await service.save(category, input, segments[3] === 'publish')))
      } catch (error) {
        res.statusCode = error.status ?? 500
        res.end(JSON.stringify({ message: error.message }))
      }
      return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(
      '<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kiểm thử bảng giá NDT Studio</title><link rel="stylesheet" href="/style.css"></head><body style="background:#f9fafb"><div id="root"></div><script src="/bundle.js"></script></body></html>'
    )
  })
  await new Promise(resolve => server.listen(process.argv.includes('--serve') ? 4329 : 0, '127.0.0.1', resolve))
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`,
    service,
    writes,
    failNextWrite: () => {
      failWrite = true
    }
  }
}

if (process.argv.includes('--serve')) {
  fixture()
    .then(({ url }) => console.log(`Pricing UI fixture ready at ${url}`))
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
} else {
  test(
    'pricing UI: validation, private drafts, publication, failures, conflict and mobile',
    { timeout: 90000 },
    async () => {
      const app = await fixture()
      const browser = await chromium.launch({ headless: true })
      try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        await page.goto(app.url)
        const price = page.getByRole('textbox', { name: 'Giá PREMIUM I', exact: true })
        await expect(price).toHaveValue('3.500.000')
        await expect(page.getByRole('button', { name: 'Xuất bản giá', exact: true })).toBeDisabled()
        await price.fill('-1')
        await expect(price).toHaveAttribute('aria-invalid', 'true')
        await expect(page.getByRole('button', { name: 'Lưu nháp', exact: true })).toBeDisabled()
        await price.fill('3900000')
        await price.press('Tab')
        await expect(price).toHaveValue('3.900.000')
        await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Lưu nháp', exact: true })).toBeDisabled()
        assert.equal((await app.service.getPublished('ca-nhan')).prices['premium-i'], 3500000)
        await page.reload()
        await expect(price).toHaveValue('3.900.000')
        await expect(page.getByRole('button', { name: 'Xuất bản giá', exact: true })).toBeEnabled()
        await page.getByRole('button', { name: 'Xuất bản giá', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Xuất bản giá', exact: true })).toBeDisabled()
        assert.equal((await app.service.getPublished('ca-nhan')).prices['premium-i'], 3900000)
        const publicPage = await browser.newPage()
        await publicPage.goto(`${app.url}/bang-gia/ca-nhan`)
        await expect(publicPage.getByText('3.900', { exact: false }).first()).toBeVisible()
        await publicPage.close()
        await price.fill('4100000')
        app.failNextWrite()
        await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click()
        await expect(page.getByRole('alert')).toContainText('Chưa thể lưu')
        await expect(price).toHaveValue('4.100.000')
        await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Lưu nháp', exact: true })).toBeDisabled()
        const current = await app.service.getConfiguration('ca-nhan')
        await app.service.save(
          'ca-nhan',
          { revision: current.revision, prices: { ...current.draft, 'premium-i': 4200000 } },
          false
        )
        await price.fill('4300000')
        await page.getByRole('button', { name: 'Xuất bản giá', exact: true }).click()
        await expect(page.getByRole('alert')).toContainText('phiên khác')
        await expect(price).toHaveValue('4.300.000')
        await expect(page.getByRole('button', { name: 'Xuất bản giá', exact: true })).toBeDisabled()
        page.once('dialog', dialog => dialog.accept())
        await page.getByRole('button', { name: 'Tải lại bảng giá', exact: true }).click()
        await expect(price).toHaveValue('4.200.000')
        await page.getByRole('button', { name: 'Gia đình', exact: true }).click()
        await expect(page.getByRole('textbox', { name: 'Giá FAMILY I', exact: true })).toHaveValue('1.500.000')
        await expect(page.getByRole('rowheader', { name: 'FAMILY I Premium · /người', exact: true })).toBeVisible()
        await page.setViewportSize({ width: 390, height: 844 })
        await expect(page.getByRole('button', { name: 'Xuất bản giá', exact: true })).toBeVisible()
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          true,
          'table scrolls internally on mobile'
        )
        assert.deepEqual(errors, [])
        assert.deepEqual(
          app.writes.map(write => write.action),
          ['draft', 'publish', 'draft', 'draft', 'publish']
        )
      } finally {
        await browser.close()
        await new Promise(resolve => app.server.close(resolve))
      }
    }
  )
}
