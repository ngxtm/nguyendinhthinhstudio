import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCollectionSlots,
  isCompleteCollection,
  moveCollectionSlot,
  type CollectionSlots
} from '../src/app/admin/homepage/collection-slots'
import type { HomepageCollectionAlbum } from '../src/lib/api/homepage-collection'

function album(id: string): HomepageCollectionAlbum {
  return {
    id,
    title: id,
    slug: id,
    description: null,
    categories: [],
    coverImage: { id: `cover-${id}` } as HomepageCollectionAlbum['coverImage']
  }
}

test('keeps saved positions even when an album is no longer eligible', () => {
  const slots = getCollectionSlots({
    configured: true,
    albumIds: ['c', 'missing', 'a'],
    albums: [album('a'), album('c')]
  })
  assert.deepEqual(
    slots.map(value => value?.id ?? null),
    ['c', null, 'a']
  )
  assert.equal(isCompleteCollection(slots), false)
})

test('requires three distinct albums', () => {
  assert.equal(isCompleteCollection([album('a'), album('b'), album('c')]), true)
  assert.equal(isCompleteCollection([album('a'), album('a'), album('c')]), false)
  assert.equal(isCompleteCollection([album('a'), null, album('c')]), false)
})

test('reordering swaps positions without mutating the saved selection', () => {
  const original: CollectionSlots = [album('a'), album('b'), album('c')]
  const moved = moveCollectionSlot(original, 1, 0)
  assert.deepEqual(
    moved.map(value => value?.id),
    ['b', 'a', 'c']
  )
  assert.deepEqual(
    original.map(value => value?.id),
    ['a', 'b', 'c']
  )
  assert.equal(moveCollectionSlot(original, 0, -1), original)
})
