import AggregateAbortController from './AggregateAbortController'
import AggregateStatusReporter from './AggregateStatusReporter'

interface Cache<U> {
  delete: (key: string) => void
  keys: () => Iterator<string>
  get: (key: string) => U | undefined
  set: (key: string, value: U) => void
  has: (key: string) => boolean
}
type FillCallback<T, U> = (
  data: T,
  signal?: AbortSignal,
  statusCallback?: Function,
) => Promise<U>

interface Entry<U> {
  aborter: AggregateAbortController
  settled: boolean
  readonly aborted: boolean
  statusReporter: AggregateStatusReporter
  promise: Promise<U>
}
export default class AbortablePromiseCache<T, U> {
  /**
   * @param {object} args constructor args
   * @param {Function} args.fill fill callback, will be called with sig `fill(data, signal)`
   * @param {object} args.cache backing store to use, must implement `get(key)`, `set(key, val)`,
   *   `delete(key)`, and `keys() -> iterator`
   */

  private cache: Cache<Entry<U>>
  private fillCallback: FillCallback<T, U>

  constructor({
    fill,
    cache,
  }: {
    fill: FillCallback<T, U>
    cache: Cache<Entry<U>>
  }) {
    if (typeof fill !== 'function') {
      throw new TypeError('must pass a fill function')
    }
    if (typeof cache !== 'object') {
      throw new TypeError('must pass a cache object')
    }
    if (
      typeof cache.get !== 'function' ||
      typeof cache.set !== 'function' ||
      typeof cache.delete !== 'function'
    ) {
      throw new TypeError(
        'cache must implement get(key), set(key, val), and and delete(key)',
      )
    }

    this.cache = cache
    this.fillCallback = fill
  }

  static isAbortException(exception: Error) {
    return (
      // DOMException
      exception.name === 'AbortError' ||
      // standard-ish non-DOM abort exception
      //@ts-ignore
      exception.code === 'ERR_ABORTED' ||
      // stringified DOMException
      exception.message === 'AbortError: aborted' ||
      // stringified standard-ish exception
      exception.message === 'Error: aborted'
    )
  }

  evict(key: string, entry: Entry<U>) {
    if (this.cache.get(key) === entry) {
      this.cache.delete(key)
    }
  }

  fill(key: string, data: T, signal?: AbortSignal, statusCallback?: Function) {
    const aborter = new AggregateAbortController()
    const statusReporter = new AggregateStatusReporter()
    statusReporter.addCallback(statusCallback)
    const newEntry: Entry<U> = {
      aborter: aborter,
      promise: this.fillCallback(data, aborter.signal, (message: unknown) => {
        statusReporter.callback(message)
      }),
      settled: false,
      statusReporter,
      get aborted() {
        return this.aborter.signal.aborted
      },
    }
    newEntry.aborter.addSignal(signal)

    // remove the fill from the cache when its abortcontroller fires, if still in there
    newEntry.aborter.signal.addEventListener('abort', () => {
      if (!newEntry.settled) {
        this.evict(key, newEntry)
      }
    })

    // chain off the cached promise to record when it settles
    newEntry.promise
      .then(
        () => {
          newEntry.settled = true
        },
        () => {
          newEntry.settled = true

          // if the fill throws an error (including abort) and is still in the cache, remove it
          this.evict(key, newEntry)
        },
      )
      .catch(error => {
        // this will only be reached if there is some kind of
        // bad bug in this library
        console.error(error)
        throw error
      })

    this.cache.set(key, newEntry)
  }

  static checkSinglePromise<U>(promise: Promise<U>, signal?: AbortSignal) {
    // check just this signal for having been aborted, and abort the
    // promise if it was, regardless of what happened with the cached
    // response
    function checkForSingleAbort() {
      if (signal?.aborted) {
        throw Object.assign(new Error('aborted'), { code: 'ERR_ABORTED' })
      }
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

  has(key: string): boolean {
    return this.cache.has(key)
  }

  /**
   * Callback for getting status of the pending async
   *
   * @callback statusCallback
   * @param {any} status, current status string or message object
   */

  /**
   * @param {any} key cache key to use for this request
   * @param {any} data data passed as the first argument to the fill callback
   * @param {AbortSignal} [signal] optional AbortSignal object that aborts the request
   * @param {statusCallback} a callback to get the current status of a pending async operation
   */
  get(
    key: string,
    data: T,
    signal?: AbortSignal,
    statusCallback?: Function,
  ): Promise<U> {
    if (!signal && data instanceof AbortSignal) {
      throw new TypeError(
        'second get argument appears to be an AbortSignal, perhaps you meant to pass `null` for the fill data?',
      )
    }
    const cacheEntry = this.cache.get(key)

    if (cacheEntry) {
      if (cacheEntry.aborted && !cacheEntry.settled) {
        // if it's aborted but has not realized it yet, evict it and redispatch
        this.evict(key, cacheEntry)
        return this.get(key, data, signal, statusCallback)
      }

      if (cacheEntry.settled) {
        // too late to abort, just return it
        return cacheEntry.promise
      }

      // request is in-flight, add this signal to its list of signals,
      // or if there is no signal, the aborter will become non-abortable
      cacheEntry.aborter.addSignal(signal)
      cacheEntry.statusReporter.addCallback(statusCallback)

      return AbortablePromiseCache.checkSinglePromise(
        cacheEntry.promise,
        signal,
      )
    }

    // if we got here, it is not in the cache. fill.
    this.fill(key, data, signal, statusCallback)
    return AbortablePromiseCache.checkSinglePromise(
      //see https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#non-null-assertion-operator-postfix-

      this.cache.get(key)!.promise,
      signal,
    )
  }

  /**
   * delete the given entry from the cache. if it exists and its fill request has
   * not yet settled, the fill will be signaled to abort.
   *
   * @param {any} key
   */
  delete(key: string) {
    const cachedEntry = this.cache.get(key)
    if (cachedEntry) {
      if (!cachedEntry.settled) {
        cachedEntry.aborter.abort()
      }
      this.cache.delete(key)
    }
  }

  /**
   * Clear all requests from the cache. Aborts any that have not settled.
   * @returns {number} count of entries deleted
   */
  clear() {
    // iterate without needing regenerator-runtime
    const keyIter = this.cache.keys()
    let deleteCount = 0
    for (let result = keyIter.next(); !result.done; result = keyIter.next()) {
      this.delete(result.value)
      deleteCount += 1
    }
    return deleteCount
  }
}
