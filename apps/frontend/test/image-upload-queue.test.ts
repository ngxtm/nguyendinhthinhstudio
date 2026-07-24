import test from 'node:test'
import assert from 'node:assert/strict'
import { runUploadQueue } from '../src/lib/image-upload/upload-queue'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

test('waits for out-of-order jobs and never exceeds the worker limit', async () => {
  const gates = [deferred(), deferred(), deferred()]
  const started: number[] = []
  let active = 0
  let maxActive = 0
  let settled = false

  const resultPromise = runUploadQueue([0, 1, 2], 2, async item => {
    started.push(item)
    active++
    maxActive = Math.max(maxActive, active)
    await gates[item].promise
    active--
  }).finally(() => {
    settled = true
  })

  await flush()
  assert.deepEqual(started, [0, 1])

  gates[1].resolve()
  await flush()
  assert.deepEqual(started, [0, 1, 2])
  assert.equal(settled, false)

  gates[2].resolve()
  await flush()
  assert.equal(settled, false)

  gates[0].resolve()
  assert.deepEqual(await resultPromise, { completed: 3, failed: 0 })
  assert.equal(maxActive, 2)
})

test('counts failures without skipping the remaining jobs', async () => {
  const visited: number[] = []
  const result = await runUploadQueue([0, 1, 2], 2, async item => {
    visited.push(item)
    if (item === 1) throw new Error('failed')
  })

  assert.deepEqual([...visited].sort(), [0, 1, 2])
  assert.deepEqual(result, { completed: 2, failed: 1 })
})
