import AbortablePromiseCache from '../src'

jest.useFakeTimers()

const {
  AbortController,
} = require('abortcontroller-polyfill/dist/cjs-ponyfill')

const QuickLRU = require('quick-lru')

function delay(ms) {
  return new Promise(r => setTimeout(r, ms))
}

beforeEach(() => {
  jest.useFakeTimers()
})

test('no aborting', async () => {
  const cache = new AbortablePromiseCache({
    cache: new QuickLRU({ maxSize: 2 }),
    async fill(data, signal) {
      await delay(30)
      if (signal.aborted)
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })

      return 42
    },
  })

  const resultP = cache.get('foo')
  jest.runAllTimers()
  expect(await resultP).toBe(42)
})

test('arg check', async () => {
  const cache = new AbortablePromiseCache({
    cache: new QuickLRU({ maxSize: 2 }),
    async fill(data, signal) {
      await delay(30)
      if (signal.aborted)
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })

      return 42
    },
  })

  const aborter = new AbortController()
  expect(() => {
    cache.get('foo', aborter.signal)
    aborter.abort()
  }).toThrow(/perhaps you meant/)
})

test('simple abort', async () => {
  const cache = new AbortablePromiseCache({
    cache: new QuickLRU({ maxSize: 2 }),
    async fill(data, signal) {
      await delay(30)
      if (signal.aborted)
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })

      return 42
    },
  })

  const aborter = new AbortController()
  const resultP = cache.get('foo', null, aborter.signal)
  aborter.abort()
  jest.runAllTimers()
  await expect(resultP).rejects.toThrow(/aborted/)
})

test('cache 2 requests, one aborted', async () => {
  let callCount = 0
  let which = 0
  let fillAborted = false
  const cache = new AbortablePromiseCache({
    cache: new QuickLRU({ maxSize: 2 }),
    async fill({ whichCall }, signal) {
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
  const resultP1 = cache.get('foo', { whichCall: 1 }, aborter1.signal)
  jest.advanceTimersByTime(10)
  const aborter2 = new AbortController()
  const resultP2 = cache.get('foo', { whichCall: 2 }, aborter2.signal)
  aborter1.abort()
  jest.runAllTimers()
  expect(callCount).toBe(1)
  expect(which).toBe(1)
  expect(await resultP2).toBe(42)
  await expect(resultP1).rejects.toThrow(/aborted/)
  expect(fillAborted).toBe(false)
  expect(callCount).toBe(1)
  expect(await cache.get('foo')).toBe(42)
  expect(callCount).toBe(1)
})

test('cache 2 requests, both aborted, and fill aborted', async () => {
  let callCount = 0
  let which = 0
  let fillAborted = false
  const cache = new AbortablePromiseCache({
    cache: new QuickLRU({ maxSize: 2 }),
    async fill({ whichCall }, signal) {
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
  const resultP1 = cache.get('foo', { whichCall: 1 }, aborter1.signal)
  jest.advanceTimersByTime(10)
  const aborter2 = new AbortController()
  const resultP2 = cache.get('foo', { whichCall: 2 }, aborter2.signal)
  aborter1.abort()
  aborter2.abort()
  jest.runAllTimers()
  expect(callCount).toBe(1)
  expect(which).toBe(1)
  await expect(resultP2).rejects.toThrow(/aborted/)
  await expect(resultP1).rejects.toThrow(/aborted/)
  expect(fillAborted).toBe(true)
})

test('cache 2 requests, both aborted, one pre-aborted, and fill aborted', async () => {
  let callCount = 0
  let which = 0
  let fillAborted = false
  const cache = new AbortablePromiseCache({
    cache: new QuickLRU({ maxSize: 2 }),
    async fill({ whichCall }, signal) {
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
  const resultP1 = cache.get('foo', { whichCall: 1 }, aborter1.signal)
  jest.advanceTimersByTime(10)
  const aborter2 = new AbortController()
  aborter1.abort()
  aborter2.abort()
  const resultP2 = cache.get('foo', { whichCall: 2 }, aborter2.signal)
  jest.runAllTimers()
  expect(callCount).toBe(1)
  expect(which).toBe(1)
  await expect(resultP2).rejects.toThrow(/aborted/)
  await expect(resultP1).rejects.toThrow(/aborted/)
  expect(fillAborted).toBe(true)
})

test('cache 2 requests, abort one and wait for it, then make another and check that fill is called twice', async () => {
  let callCount = 0
  let which = 0
  let abortCount = 0
  const cache = new AbortablePromiseCache({
    cache: new QuickLRU({ maxSize: 2 }),
    async fill({ whichCall }, signal) {
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
  const resultP1 = cache.get('foo', { whichCall: 1 }, aborter1.signal)
  aborter1.abort()
  jest.runAllTimers()
  await expect(resultP1).rejects.toThrow(/aborted/)
  expect(callCount).toBe(1)
  expect(abortCount).toBe(1)
  expect(which).toBe(1)
  const aborter2 = new AbortController()
  const resultP2 = cache.get('foo', { whichCall: 2 }, aborter2.signal)
  jest.runAllTimers()
  expect(callCount).toBe(2)
  expect(which).toBe(2)
  expect(await resultP2).toBe(42)
})

test('cache 3 requests, 2 aborted, but fill and last request did not abort', async () => {
  let callCount = 0
  let which = 0
  let fillAborted = false
  const cache = new AbortablePromiseCache({
    cache: new QuickLRU({ maxSize: 2 }),
    async fill({ whichCall }, signal) {
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
  const resultP1 = cache.get('foo', { whichCall: 1 }, aborter1.signal)
  jest.advanceTimersByTime(10)
  const aborter2 = new AbortController()
  const resultP2 = cache.get('foo', { whichCall: 2 }, aborter2.signal)
  const aborter3 = new AbortController()
  const resultP3 = cache.get('foo', { whichCall: 3 }, aborter3.signal)
  aborter1.abort()
  aborter2.abort()
  jest.runAllTimers()
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
  const cache = new AbortablePromiseCache({
    cache: new QuickLRU({ maxSize: 2 }),
    async fill({ whichCall }, signal) {
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

  const resultP1 = cache.get('foo', { whichCall: 1 })
  jest.advanceTimersByTime(10)
  cache.delete('foo')
  expect(callCount).toBe(1)
  expect(which).toBe(1)
  expect(abortCount).toBe(0)
  jest.runAllTimers()
  await expect(resultP1).rejects.toThrow(/aborted/)
  expect(abortCount).toBe(1)
})

test('clear can delete zero', async () => {
  let callCount = 0
  let which = 0
  let abortCount = 0
  const cache = new AbortablePromiseCache({
    cache: new QuickLRU({ maxSize: 2 }),
    async fill({ whichCall }, signal) {
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
  const cache = new AbortablePromiseCache({
    cache: new QuickLRU({ maxSize: 2 }),
    async fill({ whichCall }, signal) {
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

  const resultP1 = cache.get('foo', { whichCall: 1 })
  jest.advanceTimersByTime(10)
  expect(cache.clear()).toBe(1)
  expect(callCount).toBe(1)
  expect(which).toBe(1)
  expect(abortCount).toBe(0)
  jest.runAllTimers()
  await expect(resultP1).rejects.toThrow(/aborted/)
  expect(abortCount).toBe(1)
})

test('clear can delete two', async () => {
  let callCount = 0
  let which = 0
  let abortCount = 0
  const cache = new AbortablePromiseCache({
    cache: new QuickLRU({ maxSize: 2 }),
    async fill({ whichCall }, signal) {
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
  const resultP1 = cache.get('foo', { whichCall: 1 }, aborter1.signal)
  jest.runAllTimers()
  expect(await resultP1).toBe(42)
  expect(callCount).toBe(1)
  expect(abortCount).toBe(0)
  expect(which).toBe(1)
  const aborter2 = new AbortController()
  const resultP2 = cache.get('bar', { whichCall: 2 }, aborter2.signal)
  jest.runAllTimers()
  expect(callCount).toBe(2)
  expect(which).toBe(2)
  expect(await resultP2).toBe(42)
  expect(cache.clear()).toBe(2)
})
