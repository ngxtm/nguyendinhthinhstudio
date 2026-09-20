const { test } = require('node:test')
const assert = require('node:assert/strict')
const { build } = require('esbuild')
const { chromium } = require('@playwright/test')
const { createServer } = require('node:http')
const path = require('node:path')

test('album preview: hover, reset, swipe, reduced motion and failed images', async () => {
  const root = path.resolve(__dirname, '..')
  const bundle = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    platform: 'browser',
    jsx: 'automatic',
    stdin: {
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import Card from './src/app/(public)/thu-vien/AlbumPreviewCard';
        const images = ['red', 'blue', 'green'].map((color, i) => ({
          id: color, filename: color, orderIndex: i, width: 300, height: 400,
          smallUrl: '/image/' + color, mediumUrl: '/image/' + color, largeUrl: '/image/' + color
        }));
        window.previewImages = images;
        createRoot(document.getElementById('root')).render(<Card album={{
          id: 'album', slug: 'sample', title: 'Sample', imageCount: 3, coverImage: images[0]
        }} animationDelay={0} />);
      `,
      resolveDir: root,
      loader: 'tsx'
    },
    plugins: [
      {
        name: 'fixture',
        setup(build) {
          build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }))
          build.onResolve({ filter: /^@\/lib\/api\/client$/ }, () => ({ path: 'api', namespace: 'fixture' }))
          build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
            contents:
              path === 'link'
                ? "import React from 'react'; export default function Link(props) { return <a {...props}/> }"
                : 'export async function apiClient() { window.previewRequests = (window.previewRequests || 0) + 1; return window.previewImages }',
            loader: 'jsx',
            resolveDir: root
          }))
        }
      }
    ]
  })
  const server = createServer((req, res) => {
    if (req.url === '/bundle.js') {
      res.setHeader('content-type', 'text/javascript')
      res.end(bundle.outputFiles[0].text)
      return
    }
    if (req.url.startsWith('/image/')) {
      res.setHeader('content-type', 'image/svg+xml')
      res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="' +
          req.url.split('/').pop() +
          '"/></svg>'
      )
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end(
      '<html><style>body{margin:0}#root{width:300px}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.h-full{height:100%}.w-full{width:100%}.block{display:block}.h-auto{height:auto}.object-cover{object-fit:cover}.touch-pan-y{touch-action:pan-y}</style><div id="root"></div><script src="/bundle.js"></script></html>'
    )
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
    const origin = 'http://127.0.0.1:' + server.address().port
    await page.goto(origin)
    const card = page.locator('.gallery-card-enter')
    const link = page.getByRole('link', { name: 'Xem bộ ảnh Sample' })
    const counter = link.locator('span')
    await link.waitFor()
    assert.equal(await page.evaluate(() => window.previewRequests || 0), 0)
    const before = await link.boundingBox()
    await card.hover({ position: { x: 100, y: 100 } })
    await page.waitForTimeout(250)
    assert.equal(await counter.textContent(), '1/3')
    await page.waitForFunction(() => document.querySelector('a span')?.textContent === '2/3')
    assert.ok(Math.abs((await link.boundingBox()).height - before.height) < 1)
    await page.waitForFunction(() => document.querySelector('a span')?.textContent === '3/3')
    await page.waitForFunction(() => document.querySelector('a span')?.textContent === '1/3')
    await page.mouse.move(800, 800)
    await page.waitForTimeout(2100)
    assert.equal(await counter.textContent(), '1/3')
    assert.equal(await page.evaluate(() => window.previewRequests), 1)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await card.hover({ position: { x: 100, y: 100 } })
    await page.waitForTimeout(700)
    assert.equal(await counter.textContent(), '1/3')
    await page.getByRole('button', { name: 'Ảnh tiếp theo của Sample' }).click()
    await page.waitForFunction(() => document.querySelector('a span')?.textContent === '2/3')
    await page.mouse.move(800, 800)
    await link.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 220, clientY: 100 }] })
    await link.dispatchEvent('touchmove', { touches: [{ identifier: 1, clientX: 100, clientY: 105 }] })
    await link.dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: 100, clientY: 105 }] })
    await page.waitForFunction(() => document.querySelector('a span')?.textContent === '2/3')
    const prevented = await link.evaluate(
      node => !node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    )
    assert.equal(prevented, true)
    await link.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 100, clientY: 100 }] })
    await link.dispatchEvent('touchmove', { touches: [{ identifier: 1, clientX: 105, clientY: 200 }] })
    await link.dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: 105, clientY: 200 }] })
    assert.equal(await counter.textContent(), '2/3')
    await page.getByRole('link', { name: 'Sample', exact: true }).click()
    assert.equal(new URL(page.url()).pathname, '/thu-vien/sample')
    await page.goto(origin)
    await page.route('**/image/blue', route => route.abort())
    await page.getByRole('button', { name: 'Ảnh tiếp theo của Sample' }).click()
    await page.waitForTimeout(500)
    assert.equal(await page.locator('a span').textContent(), '1/3')
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})
