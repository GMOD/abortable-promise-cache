import AggregateAbortController from './AggregateAbortController'

const { AbortSignal } = require('abortcontroller-polyfill/dist/cjs-ponyfill')

if (!AbortSignal) throw new Error('no abortsignal')

export default class AbortablePromiseCache {
  /**
   * @param {object} args constructor args
   * @param {Function} args.fill fill callback, will be called with sig `fill(data, signal)`
   * @param {object} args.cache backing store to use, must implement `get(key)`, `set(key, val)`,
   *  and `delete(key)`
   */
  constructor({ fill, cache }) {
    if (typeof fill !== 'function')
      throw new TypeError('must pass a fill function')
    if (typeof cache !== 'object')
      throw new TypeError('must pass a cache object')
    if (
      typeof cache.get !== 'function' ||
      typeof cache.set !== 'function' ||
      typeof cache.delete !== 'function'
    )
      throw new TypeError(
        'cache must implement get(key), set(key, val), and and delete(key)',
      )

    this.cache = cache
    this.fillCallback = fill
  }

  static isAbortException(exception) {
    return (
      // DOMException
      exception.name === 'AbortError' ||
      // standard-ish non-DOM abort exception
      exception.code === 'ERR_ABORTED' ||
      // stringified DOMException
      exception.message === 'AbortError: aborted' ||
      // stringified standard-ish exception
      exception.message === 'Error: aborted'
    )
  }

  fill(key, data, signal) {
    const newEntry = {
      aborter: new AggregateAbortController(),
      settled: false,
    }
    newEntry.promise = this.fillCallback(data, newEntry.aborter.signal)
    newEntry.aborter.addSignal(signal)

    // chain off the cached promise to record when it settles
    newEntry.promise
      .then(
        () => {
          newEntry.settled = true
        },
        exception => {
          newEntry.settled = true

          // if the promise aborts and is still in the cache, remove it
          if (
            AbortablePromiseCache.isAbortException(exception) &&
            this.cache.get(key) === newEntry
          ) {
            this.cache.delete(key)
          }
        },
      )
      .catch(e => {
        // this will only be reached if there is some kind of
        // bad bug in this library
        console.error(e)
        throw e
      })

    this.cache.set(key, newEntry)
  }

  static checkSinglePromise(promise, signal) {
    // check just this signal for having been aborted, and abort the
    // promise if it was, regardless of what happened with the cached
    // response
    function checkForSingleAbort() {
      if (signal && signal.aborted)
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
    }

    return promise.then(
      result => {
        checkForSingleAbort()
        return result
      },
      error => {
        checkForSingleAbort()
        throw error
      },
    )
  }

  /**
   * @param {any} key cache key to use for this request
   * @param {any} data data passed as the first argument to the fill callback
   * @param {AbortSignal} [signal] optional AbortSignal object that aborts the request
   */
  get(key, data, signal) {
    if (!signal && data instanceof AbortSignal)
      throw new TypeError(
        'second get argument appears to be an AbortSignal, perhaps you meant to pass `null` for the fill data?',
      )
    const cacheEntry = this.cache.get(key)

    if (cacheEntry) {
      if (cacheEntry.settled)
        // too late to abort, just return it
        return cacheEntry.promise

      // request is in-flight, add this signal to its list of signals,
      // or if there is no signal, the aborter will become non-abortable
      cacheEntry.aborter.addSignal(signal)

      return AbortablePromiseCache.checkSinglePromise(
        cacheEntry.promise,
        signal,
      )
    }

    // if we got here, it is not in the cache. fill.
    this.fill(key, data, signal)
    return AbortablePromiseCache.checkSinglePromise(
      this.cache.get(key).promise,
      signal,
    )
  }
}
