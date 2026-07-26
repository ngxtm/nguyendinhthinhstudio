import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const confirmationPageSources = [
  '../src/app/admin/staff/page.tsx',
  '../src/app/admin/albums/page.tsx',
  '../src/app/admin/albums/[id]/edit/page.tsx',
  '../src/app/admin/categories/page.tsx',
  '../src/app/admin/tags/page.tsx'
]

test('admin delete flows do not invoke native confirmation prompts', () => {
  for (const relativePath of confirmationPageSources) {
    const source = readSource(relativePath)

    assert.doesNotMatch(source, /(?:window\s*\.\s*)?confirm\s*\(/, relativePath)
  }
})

test('staff and album delete flows use the reusable pending-aware confirmation dialog', () => {
  for (const relativePath of confirmationPageSources.slice(0, 3)) {
    const source = readSource(relativePath)

    assert.match(
      source,
      /import\s+ConfirmDialog\s+from\s+['"][^'"]*ConfirmDialog['"]/,
      `${relativePath} must import ConfirmDialog`
    )
    assert.match(
      source,
      /<ConfirmDialog\b[\s\S]*?\bisPending=\{/,
      `${relativePath} must render ConfirmDialog with isPending`
    )
  }
})

test('bulk removal opens a reusable confirmation dialog that confirms the removal handler', () => {
  const source = readSource('../src/app/admin/components/DeleteConfirmModal.tsx')

  assert.match(source, /import\s+ConfirmDialog\s+from\s+['"][^'"]*ConfirmDialog['"]/)
  assert.match(
    source,
    /onClick=\{\(\)\s*=>\s*set[A-Za-z0-9_]*Bulk[A-Za-z0-9_]*\(true\)\}/,
    'bulk removal must open a confirmation dialog'
  )
  assert.match(
    source,
    /<ConfirmDialog\b[\s\S]*?\bopen=\{bulkConfirmOpen\}[\s\S]*?\bonConfirm=\{handleConfirmBulkRemove\}/,
    'the bulk confirmation dialog must call its confirmed removal handler'
  )
})

test('dependency modal opens albums by slug', () => {
  const source = readSource('../src/app/admin/components/DeleteConfirmModal.tsx')

  assert.match(source, /href=\{\`\/admin\/albums\/\$\{album\.slug\}\`\}/)
  assert.doesNotMatch(source, /href=\{\`\/admin\/albums\/\$\{album\.id\}\`\}/)
})
