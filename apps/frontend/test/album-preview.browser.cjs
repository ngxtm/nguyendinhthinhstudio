const { test } = require('node:test')
const assert = require('node:assert/strict')
const { build } = require('esbuild')
const { chromium } = require('@playwright/test')
const { createServer } = require('node:http')
const path = require('node:path')
const { readFile } = require('node:fs/promises')
const postcss = require('postcss')

test('album preview: hover, reset, swipe, reduced motion and failed images', async () => {
  const root = path.resolve(__dirname, '..')
  const stylesheet = await postcss([require('@tailwindcss/postcss')({ base: root })]).process(
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
        import { createRoot } from 'react-dom/client';
        import Card from './src/app/(public)/thu-vien/AlbumPreviewCard';
        import PricingModel from './src/app/(public)/bang-gia/ca-nhan/components/PricingModel';
        import ServiceCategories from './src/app/(public)/bang-gia/components/ServiceCategories';
        import NavigationLinks from './src/app/components/common/NavigationLinks';
        const images = ['red', 'blue', 'green'].map((color, i) => ({
          id: color, filename: color, orderIndex: i, width: i === 1 ? 400 : 300, height: i === 1 ? 200 : 400,
          smallUrl: '/image/' + color, mediumUrl: '/image/' + color, largeUrl: '/image/' + color
        }));
        window.previewImages = images;
        createRoot(document.getElementById('root')).render(location.search === '?theme' ? <>
          <NavigationLinks links={[{label:'Thư viện',href:'/thu-vien'}]}/>
          <ServiceCategories categories={[{id:'sample',title:'Dịch vụ',description:'Mô tả dịch vụ'}]} openAccordions={new Set(['sample'])} onToggleAccordion={() => {}} />
          <PricingModel pricingPackages={[{id:'price',title:'Gói ảnh',type:'Cá nhân',angleLable:'PRIVATE',subContent:'Chi tiết',services:[{id:'s',content:'Dịch vụ chụp',isActive:true}],subCard:[{title:'Cơ bản',price:500,services:[{id:'s',content:'Ảnh chỉnh sửa'}],subContent:'Thông tin gói'}]}]}/>
        </> : <Card album={{
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
    if (req.url === '/style.css') {
      res.setHeader('content-type', 'text/css')
      res.end(stylesheet.css)
      return
    }
    if (req.url === '/bundle.js') {
      res.setHeader('content-type', 'text/javascript')
      res.end(bundle.outputFiles[0].text)
      return
    }
    if (req.url.startsWith('/image/')) {
      res.setHeader('content-type', 'image/svg+xml')
      res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="' +
          (req.url.endsWith('blue') ? 400 : 300) +
          '" height="' +
          (req.url.endsWith('blue') ? 200 : 400) +
          '"><rect width="100%" height="100%" fill="' +
          req.url.split('/').pop() +
          '"/></svg>'
      )
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end(
      '<html><link rel="stylesheet" href="/style.css"><style>#root{width:300px}</style><div id="root"></div><script src="/bundle.js"></script></html>'
    )
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
    const origin = 'http://127.0.0.1:' + server.address().port
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(origin)
    const card = page.locator('.gallery-card-enter')
    const link = page.getByRole('link', { name: 'Xem bộ ảnh Sample' })
    const counter = link.locator('span')
    await link.waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    const button = page.getByRole('button', { name: 'Ảnh tiếp theo của Sample' })
    const buttonBox = await button.boundingBox()
    const iconBox = await button.locator('svg').boundingBox()
    assert.ok(Math.abs(buttonBox.width - buttonBox.height) < 1, 'navigation buttons must be circles')
    assert.ok(
      Math.abs(iconBox.x + iconBox.width / 2 - buttonBox.x - buttonBox.width / 2) < 1,
      'arrow must be horizontally centered'
    )
    assert.ok(
      Math.abs(iconBox.y + iconBox.height / 2 - buttonBox.y - buttonBox.height / 2) < 1,
      'arrow must be vertically centered'
    )
    await button.click()
    await page.waitForFunction(() => document.querySelector('a span')?.textContent === '2/3')
    const frameStyle = await page
      .locator('.preview-frame')
      .evaluate(el => ({
        height: el.getBoundingClientRect().height,
        fit: getComputedStyle(el).objectFit,
        background: getComputedStyle(el).backgroundColor
      }))
    assert.equal(frameStyle.fit, 'contain')
    assert.equal(frameStyle.height, 400)
    assert.equal(frameStyle.background, 'rgb(255, 255, 255)')
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(250)
    assert.equal(
      await page.locator('.preview-frame').evaluate(el => getComputedStyle(el).backgroundColor),
      'rgb(0, 0, 0)'
    )
    await page.screenshot({ path: require('node:os').tmpdir() + '/ndt-preview-dark.png' })
    const titleColor = await page.locator('h2').evaluate(el => getComputedStyle(el).color)
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForTimeout(250)
    assert.notEqual(await page.locator('h2').evaluate(el => getComputedStyle(el).color), titleColor)
    await page.screenshot({ path: require('node:os').tmpdir() + '/ndt-preview-light.png' })
    await page.setViewportSize({ width: 1100, height: 900 })
    await page.mouse.move(800, 800)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(origin)
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
    await page.goto(origin + '/?theme')
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(300)
    const contrastFailures = await page.evaluate(() => {
      const context = document.createElement('canvas').getContext('2d')
      function luminance(color) {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = color
        context.fillRect(0, 0, 1, 1)
        const rgb = Array.from(context.getImageData(0, 0, 1, 1).data)
          .slice(0, 3)
          .map(v => v / 255)
          .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
      }
      return Array.from(document.querySelectorAll('a, p, h3, h4, span'))
        .filter(el => el.textContent.trim() && !el.children.length)
        .flatMap(el => {
          let background = getComputedStyle(document.body).backgroundColor
          for (let node = el; node; node = node.parentElement) {
            const bg = getComputedStyle(node).backgroundColor
            if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
              background = bg
              break
            }
          }
          const fg = luminance(getComputedStyle(el).color),
            bg = luminance(background)
          const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
          return ratio < 4.5 ? [{ text: el.textContent, ratio }] : []
        })
    })
    assert.deepEqual(contrastFailures, [], 'dark navigation and pricing text must remain readable')
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})
