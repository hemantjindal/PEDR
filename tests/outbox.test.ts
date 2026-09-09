import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import * as outbox from '@/lib/outbox'

/**
 * The queue behind the box on a phone with no signal. What matters is that a
 * note written on site is still there afterwards, in the order it was written,
 * and that a browser refusing to give us a store never takes the page down
 * with it.
 */

beforeEach(async () => {
  await outbox.clear()
})

describe('the offline outbox', () => {
  it('keeps a note and gives it back', async () => {
    await outbox.queue({ raw: 'site visit 1042, drainage detail missing', reference: '2026-09-09' })
    const notes = await outbox.list()
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({
      raw: 'site visit 1042, drainage detail missing',
      reference: '2026-09-09',
      reason: 'offline',
    })
    expect(notes[0].id).toBeTruthy()
    expect(notes[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('records why a note ended up here', async () => {
    await outbox.queue({ raw: 'a', reference: '2026-09-09', reason: 'failed' })
    expect((await outbox.list())[0].reason).toBe('failed')
  })

  it('gives them back oldest first, which is the order they get worked through', async () => {
    // Only the clock: faking timers wholesale stalls IndexedDB, which runs
    // its callbacks on the task queue.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-07T09:00:00Z'))
    await outbox.queue({ raw: 'monday', reference: '2026-09-07' })
    vi.setSystemTime(new Date('2026-09-08T09:00:00Z'))
    await outbox.queue({ raw: 'tuesday', reference: '2026-09-08' })
    vi.setSystemTime(new Date('2026-09-09T09:00:00Z'))
    await outbox.queue({ raw: 'wednesday', reference: '2026-09-09' })
    vi.useRealTimers()

    expect((await outbox.list()).map((n) => n.raw)).toEqual(['monday', 'tuesday', 'wednesday'])
  })

  it('survives a whole week of site notes', async () => {
    for (let i = 0; i < 40; i++) {
      await outbox.queue({ raw: `note ${i}`, reference: '2026-09-09' })
    }
    expect(await outbox.count()).toBe(40)
  })

  it('drops one without touching the others', async () => {
    const first = await outbox.queue({ raw: 'keep', reference: '2026-09-09' })
    await outbox.queue({ raw: 'also keep', reference: '2026-09-09' })
    await outbox.remove(first.id)
    expect((await outbox.list()).map((n) => n.raw)).toEqual(['also keep'])
  })

  it('ignores a removal for something that is not there', async () => {
    await expect(outbox.remove('nothing')).resolves.toBeUndefined()
  })

  it('gives every note its own id', async () => {
    const ids = new Set<string>()
    for (let i = 0; i < 50; i++) {
      ids.add((await outbox.queue({ raw: String(i), reference: '2026-09-09' })).id)
    }
    expect(ids.size).toBe(50)
  })

  it('holds text verbatim, including the newlines somebody typed', async () => {
    const raw = 'mon - site\n\ntue: 1042 tender package\n  - and the stair detail'
    await outbox.queue({ raw, reference: '2026-09-09' })
    expect((await outbox.list())[0].raw).toBe(raw)
  })
})

describe('when the browser will not give us a store', () => {
  it('safeList answers empty rather than throwing the page down', async () => {
    const original = globalThis.indexedDB
    // A private window, or site data switched off.
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true })
    try {
      expect(outbox.isSupported()).toBe(false)
      await expect(outbox.safeList()).resolves.toEqual([])
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: original, configurable: true })
    }
  })

  it('safeList answers empty when the store itself fails', async () => {
    const original = indexedDB.open
    indexedDB.open = (() => { throw new Error('quota') }) as typeof indexedDB.open
    try {
      await expect(outbox.safeList()).resolves.toEqual([])
    } finally {
      indexedDB.open = original
    }
  })
})
