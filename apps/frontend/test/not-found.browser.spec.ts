import { expect, test } from '@playwright/test'

const baseUrl = process.env.FRONTEND_BASE_URL?.trim()

for (const viewport of [
  { width: 1366, height: 650 },
  { width: 390, height: 640 },
  { width: 568, height: 320 }
]) {
  test(`the 404 page fits a ${viewport.width} × ${viewport.height} viewport`, async ({ page }) => {
    test.skip(!baseUrl, 'Set FRONTEND_BASE_URL to the running frontend')
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })

    const response = await page.goto(new URL('/kiem-tra-404-no-such-page', baseUrl).href)
    expect(response?.status()).toBe(404)
    await page.evaluate(async () => {
      await document.fonts.ready
    })

    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { name: '404 – Lạc mất khung hình' })).toBeInViewport({ ratio: 1 })
    await expect(main.getByRole('link', { name: 'Về trang chủ' })).toBeInViewport({ ratio: 1 })
    await expect(main.locator('img[src$="/blank-print.webp"]')).toBeInViewport({ ratio: 1 })
    const contentSize = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    }))
    expect(contentSize).toEqual(viewport)
  })
}
