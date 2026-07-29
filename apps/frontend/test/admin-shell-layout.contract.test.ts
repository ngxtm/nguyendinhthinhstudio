import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/app/admin/AdminShell.tsx', import.meta.url), 'utf8')

test('desktop sidebar stays fixed and keeps its navigation and footer accessible on long pages', () => {
  const asideClasses = source.match(/<aside\s+className=\{\`([^\`]*)\`\}/)?.[1]
  const navClasses = source.match(/<nav className="([^"]*)">/)?.[1]

  assert.ok(asideClasses, 'sidebar classes must remain present')
  assert.match(asideClasses, /\bfixed\b/)
  assert.match(asideClasses, /\binset-y-0\b/)
  assert.doesNotMatch(asideClasses, /\blg:sticky\b/)
  assert.doesNotMatch(asideClasses, /\blg:h-screen\b/)
  assert.match(source, /<div className="flex shrink-0 items-center justify-between px-6 py-5 lg:py-6">/)

  assert.ok(navClasses, 'sidebar navigation classes must remain present')
  assert.match(navClasses, /\bmin-h-0\b/)
  assert.match(navClasses, /\bflex-1\b/)
  assert.match(navClasses, /\boverflow-y-auto\b/)

  assert.match(source, /<div className="mt-auto shrink-0 space-y-3 border-t/)
  assert.match(source, /<div className="flex min-w-0 flex-1 flex-col lg:pl-64">/)
})
