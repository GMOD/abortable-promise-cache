import AbortablePromiseCache from '../src'
import { test, beforeEach, expect, vi } from 'vitest'

vi.useFakeTimers()

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

beforeEach(() => {
  vi.useFakeTimers()
})

test('no aborting', async () => {
  const cache = new AbortablePromiseCache({
    max: 2,
    async fetchMethod(key, staleValue, { signal, options, context }) {
      await delay(30)
      if (signal.aborted) {
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
      }

      return 42
    },
  })

  const resultP = cache.fetch('foo')
  vi.runAllTimers()
  expect(await resultP).toBe(42)
})
//
// test('arg check', async () => {
//   const cache = new AbortablePromiseCache({
//     max: 2,
//     async fetchMethod(key, staleValue, { signal, options, context }) {
//       await delay(30)
//       if (signal.aborted) {
//         throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
//       }
//
//       return 42
//     },
//   })
//
//   const aborter = new AbortController()
//   expect(() => {
//     cache.fetch('foo', { signal: aborter.signal })
//     aborter.abort()
//   }).toThrow(/perhaps you meant/)
// })

test('simple abort', async () => {
  const cache = new AbortablePromiseCache({
    max: 2,
    async fetchMethod(key, staleValue, { signal, options, context }) {
      await delay(30)
      if (signal.aborted) {
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
      }

      return 42
    },
  })

  const aborter = new AbortController()
  const resultP = cache.fetch('foo', { context: null, signal: aborter.signal })
  aborter.abort()
  vi.runAllTimers()
  await expect(resultP).rejects.toThrow(/aborted/)
})

test('cache 2 requests, one aborted', async () => {
  let callCount = 0
  let which = 0
  let fillAborted = false
  const cache = new AbortablePromiseCache<
    string,
    number,
    { whichCall: number }
  >({
    max: 2,
    async fetchMethod(key, staleValue, { signal, options, context }) {
      const { whichCall } = context
      callCount += 1
      which = whichCall
      await delay(30)
      if (signal.aborted) {
        fillAborted = true
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
      }

      return 42
    },
  })

  const aborter1 = new AbortController()
  const resultP1 = cache.fetch('foo', {
    context: { whichCall: 1 },
    signal: aborter1.signal,
  })
  vi.advanceTimersByTime(10)
  const aborter2 = new AbortController()
  const resultP2 = cache.fetch('foo', {
    context: { whichCall: 2 },
    signal: aborter2.signal,
  })
  aborter1.abort()
  vi.runAllTimers()
  expect(callCount).toBe(1)
  expect(which).toBe(1)
  expect(await resultP2).toBe(42)
  await expect(resultP1).rejects.toThrow(/aborted/)
  expect(fillAborted).toBe(false)
  expect(callCount).toBe(1)
  expect(await cache.fetch('foo', { context: { whichCall: 100 } })).toBe(42)
  expect(callCount).toBe(1)
})

test('cache 2 requests, both aborted, and fill aborted', async () => {
  let callCount = 0
  let which = 0
  let fillAborted = false
  const cache = new AbortablePromiseCache<
    string,
    number,
    { whichCall: number }
  >({
    max: 2,
    async fetchMethod(key, staleValue, { signal, options, context }) {
      const { whichCall } = context
      callCount += 1
      which = whichCall
      await delay(30)
      if (signal.aborted) {
        fillAborted = true
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
      }

      return 42
    },
  })

  const aborter1 = new AbortController()
  const resultP1 = cache.fetch('foo', {
    context: { whichCall: 1 },
    signal: aborter1.signal,
  })
  vi.advanceTimersByTime(10)
  const aborter2 = new AbortController()
  const resultP2 = cache.fetch('foo', {
    context: { whichCall: 2 },
    signal: aborter2.signal,
  })
  aborter1.abort()
  aborter2.abort()
  vi.runAllTimers()
  expect(callCount).toBe(1)
  expect(which).toBe(1)
  await expect(resultP2).rejects.toThrow(/aborted/)
  await expect(resultP1).rejects.toThrow(/aborted/)
  expect(fillAborted).toBe(true)
})

test('cache 2 requests, both aborted, one pre-aborted, and fill aborted', async () => {
  let callCount = 0
  let which = 0
  let finishedCount = 0
  let fillAborted = false
  const cache = new AbortablePromiseCache<
    string,
    number,
    { whichCall: number }
  >({
    max: 2,
    async fetchMethod(key, staleValue, { signal, options, context }) {
      const { whichCall } = context
      callCount += 1
      which = whichCall
      await delay(30)
      if (signal.aborted) {
        fillAborted = true
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
      }

      finishedCount += 1
      return 42
    },
  })

  const aborter1 = new AbortController()
  const resultP1 = cache.fetch('foo', {
    context: { whichCall: 1 },
    signal: aborter1.signal,
  })
  vi.advanceTimersByTime(10)
  const aborter2 = new AbortController()
  aborter1.abort() //< this aborts call 1 before it finishes, and also makes it get evicted from the cache
  aborter2.abort() //< we abort call 2 before we even start it
  const resultP2 = cache.fetch('foo', {
    context: { whichCall: 2 },
    signal: aborter1.signal,
  })
  vi.runAllTimers()
  expect(callCount).toBe(2)
  expect(which).toBe(2)
  expect(finishedCount).toBe(0)
  await expect(resultP2).rejects.toThrow(/aborted/)
  await expect(resultP1).rejects.toThrow(/aborted/)
  expect(fillAborted).toBe(true)
})

test('cache 2 requests, abort one and wait for it, then make another and check that fill is called twice', async () => {
  let callCount = 0
  let which = 0
  let abortCount = 0
  const cache = new AbortablePromiseCache<
    string,
    number,
    { whichCall: number }
  >({
    max: 2,
    async fetchMethod(key, staleValue, { signal, options, context }) {
      const { whichCall } = context
      callCount += 1
      which = whichCall
      await delay(30)
      if (signal.aborted) {
        abortCount += 1
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
      }

      return 42
    },
  })

  const aborter1 = new AbortController()
  const resultP1 = cache.fetch('foo', {
    context: { whichCall: 1 },
    signal: aborter1.signal,
  })
  aborter1.abort()
  vi.runAllTimers()
  await expect(resultP1).rejects.toThrow(/aborted/)
  expect(callCount).toBe(1)
  expect(abortCount).toBe(1)
  expect(which).toBe(1)
  const aborter2 = new AbortController()
  const resultP2 = cache.fetch('foo', {
    context: { whichCall: 2 },
    signal: aborter2.signal,
  })
  vi.runAllTimers()
  expect(callCount).toBe(2)
  expect(which).toBe(2)
  expect(await resultP2).toBe(42)
})

test('cache 3 requests, 2 aborted, but fill and last request did not abort', async () => {
  let callCount = 0
  let which = 0
  let fillAborted = false
  const cache = new AbortablePromiseCache<
    string,
    number,
    { whichCall: number }
  >({
    max: 2,
    async fetchMethod(key, staleValue, { signal, options, context }) {
      const { whichCall } = context
      callCount += 1
      which = whichCall
      await delay(30)
      if (signal.aborted) {
        fillAborted = true
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
      }

      return 42
    },
  })

  const aborter1 = new AbortController()
  const resultP1 = cache.fetch('foo', {
    context: { whichCall: 1 },
    signal: aborter1.signal,
  })
  vi.advanceTimersByTime(10)
  const aborter2 = new AbortController()
  const resultP2 = cache.fetch('foo', {
    context: { whichCall: 2 },
    signal: aborter2.signal,
  })
  const aborter3 = new AbortController()
  const resultP3 = cache.fetch('foo', {
    context: { whichCall: 3 },
    signal: aborter3.signal,
  })
  aborter1.abort()
  aborter2.abort()
  vi.runAllTimers()
  expect(callCount).toBe(1)
  expect(which).toBe(1)
  await expect(resultP2).rejects.toThrow(/aborted/)
  await expect(resultP1).rejects.toThrow(/aborted/)
  expect(await resultP3).toBe(42)
  expect(fillAborted).toBe(false)
})

test('deleting aborts', async () => {
  let callCount = 0
  let which = 0
  let abortCount = 0
  const cache = new AbortablePromiseCache<
    string,
    number,
    { whichCall: number }
  >({
    max: 2,
    async fetchMethod(key, staleValue, { signal, options, context }) {
      const { whichCall } = context
      callCount += 1
      which = whichCall
      await delay(30)
      if (signal.aborted) {
        abortCount += 1
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
      }

      return 42
    },
  })

  const resultP1 = cache.fetch('foo', { context: { whichCall: 1 } })
  vi.advanceTimersByTime(10)
  cache.delete('foo')
  expect(callCount).toBe(1)
  expect(which).toBe(1)
  expect(abortCount).toBe(0)
  vi.runAllTimers()
  await expect(resultP1).rejects.toThrow(/aborted/)
  expect(abortCount).toBe(1)
})

test('clear can delete zero', async () => {
  let callCount = 0
  let which = 0
  let abortCount = 0
  const cache = new AbortablePromiseCache<
    string,
    number,
    { whichCall: number }
  >({
    max: 2,
    async fetchMethod(key, staleValue, { signal, options, context }) {
      const { whichCall } = context
      callCount += 1
      which = whichCall
      await delay(30)
      if (signal.aborted) {
        abortCount += 1
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
      }

      return 42
    },
  })
  expect(cache.clear()).toBe(0)
  expect(which).toBe(0)
  expect(abortCount).toBe(0)
  expect(callCount).toBe(0)
})

test('clear can delete one', async () => {
  let callCount = 0
  let which = 0
  let abortCount = 0
  const cache = new AbortablePromiseCache<
    string,
    number,
    { whichCall: number }
  >({
    max: 2,
    async fetchMethod(key, staleValue, { signal, options, context }) {
      const { whichCall } = context
      callCount += 1
      which = whichCall
      await delay(30)
      if (signal.aborted) {
        abortCount += 1
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
      }

      return 42
    },
  })

  const resultP1 = cache.fetch('foo', { context: { whichCall: 1 } })
  vi.advanceTimersByTime(10)
  expect(cache.clear()).toBe(1)
  expect(callCount).toBe(1)
  expect(which).toBe(1)
  expect(abortCount).toBe(0)
  vi.runAllTimers()
  await expect(resultP1).rejects.toThrow(/aborted/)
  expect(abortCount).toBe(1)
})

test('clear can delete two', async () => {
  let callCount = 0
  let which = 0
  let abortCount = 0
  const cache = new AbortablePromiseCache<
    string,
    number,
    { whichCall: number }
  >({
    max: 2,
    async fetchMethod(key, staleValue, { signal, options, context }) {
      const { whichCall } = context
      callCount += 1
      which = whichCall
      await delay(30)
      if (signal.aborted) {
        abortCount += 1
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
      }

      return 42
    },
  })

  const aborter1 = new AbortController()
  const resultP1 = cache.fetch('foo', {
    signal: aborter1.signal,
    context: { whichCall: 1 },
  })
  expect(cache.has('foo')).toBe(true)
  vi.runAllTimers()
  expect(await resultP1).toBe(42)
  expect(callCount).toBe(1)
  expect(abortCount).toBe(0)
  expect(which).toBe(1)
  const aborter2 = new AbortController()
  const resultP2 = cache.fetch('bar', {
    signal: aborter2.signal,
    context: { whichCall: 2 },
  })
  expect(cache.has('bar')).toBe(true)
  vi.runAllTimers()
  expect(callCount).toBe(2)
  expect(which).toBe(2)
  expect(await resultP2).toBe(42)
  expect(cache.clear()).toBe(2)
  expect(cache.has('foo')).toBe(false)
  expect(cache.has('bar')).toBe(false)
})

test('not caching errors', async () => {
  let i = 0
  const cache = new AbortablePromiseCache({
    max: 2,
    async fetchMethod() {
      if (i++ === 0) {
        throw new Error('first time')
      } else {
        return 42
      }
    },
  })

  await expect(cache.fetch('foo')).rejects.toEqual(new Error('first time'))
  await expect(cache.fetch('foo')).resolves.toEqual(42)
})

test('status callback', async () => {
  const aborter = new AbortController()
  const cache = new AbortablePromiseCache<
    string,
    string,
    { statusCallback: (arg: string) => void; testing: string }
  >({
    max: 2,
    async fetchMethod(key, staleValue, { signal, options, context }) {
      const { statusCallback } = context
      await delay(100)
      statusCallback('working...')
      return 'success'
    },
  })

  const s1 = vi.fn()
  const s2 = vi.fn()
  const p1 = cache.fetch('foo', {
    signal: aborter.signal,
    context: {
      statusCallback: s1,
      testing: 'test1',
    },
  })
  const p2 = cache.fetch('foo', {
    signal: aborter.signal,
    context: {
      statusCallback: s2,
      testing: 'test2',
    },
  })

  vi.runAllTimers()
  await Promise.all([p1, p2])
  expect(s1).toHaveBeenCalledWith('working...')
  expect(s2).toHaveBeenCalledWith('working...')
})
