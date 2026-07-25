import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('test scripts build image upload policy before running Node tests', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const buildCommand = 'npm --workspace @ndt/image-upload-policy run build'

  assert.match(packageJson.scripts.pretest, new RegExp(buildCommand))
  assert.match(packageJson.scripts['pretest:focused'], new RegExp(buildCommand))
})
