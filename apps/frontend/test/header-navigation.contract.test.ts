import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const headerPath = new URL('../src/app/components/layout/Header.tsx', import.meta.url)

test('desktop nested category parents remain links to their own category landing page', () => {
  const source = readFileSync(headerPath, 'utf8')
  const desktopMenuStart = source.indexOf('/* Main Dropdown Menu */')
  const desktopMenuEnd = source.indexOf('/* Social Links */')
  assert.ok(desktopMenuStart >= 0, 'desktop dropdown marker must exist')
  assert.ok(desktopMenuEnd > desktopMenuStart, 'desktop navigation must precede social links')

  const desktopMenu = source.slice(desktopMenuStart, desktopMenuEnd)
  const nestedParentBranch = desktopMenu.match(/child\.children\s*\?\s*\(([\s\S]*?)\)\s*:\s*\(/)?.[1]
  assert.ok(nestedParentBranch, 'desktop nested category branch must exist')
  assert.match(
    nestedParentBranch,
    /<Link\s+href=\{child\.href\}[\s\S]*?child\.label/,
    'a nested desktop category parent must navigate to its own href'
  )
})
