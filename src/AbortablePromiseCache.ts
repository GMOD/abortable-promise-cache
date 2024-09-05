import AggregateAbortController from './AggregateAbortController'
import AggregateStatusReporter from './AggregateStatusReporter'

import { LRUCache } from 'lru-cache'

export default class AbortablePromiseCache<
  K extends {},
  V extends {},
  FC = unknown,
> extends LRUCache<K, V, FC> {
  currentlyWatching = new Map<K, number>()

  currentlyAborted = new Map<K, number>()

  aggregateAbortControllers = new Map<K, AbortController>()

  aggregateStatusReporters = new Map<K, AggregateStatusReporter>()

  fetch(
    k: K,
    fetchOptions: unknown extends FC
      ? LRUCache.FetchOptions<K, V, FC>
      : FC extends undefined | void
        ? LRUCache.FetchOptionsNoContext<K, V>
        : LRUCache.FetchOptionsWithContext<K, V, FC>,
  ): Promise<undefined | V>

  // this overload not allowed if context is required
  fetch(
    k: unknown extends FC ? K : FC extends undefined | void ? K : never,
    fetchOptions?: unknown extends FC
      ? LRUCache.FetchOptions<K, V, FC>
      : FC extends undefined | void
        ? LRUCache.FetchOptionsNoContext<K, V>
        : never,
  ): Promise<undefined | V>

  async fetch(
    k: K,
    fetchOptions: LRUCache.FetchOptions<K, V, FC> = {},
  ): Promise<undefined | V> {
    const val = this.currentlyWatching.get(k)
    if (val === undefined) {
      console.log('here0', 1)
      this.currentlyWatching.set(k, 1)
    } else {
      console.log('here', val + 1)
      this.currentlyWatching.set(k, val + 1)
    }
    const { signal, ...rest } = fetchOptions

    let aggregateAbortController = this.aggregateAbortControllers.get(k)
    if (aggregateAbortController === undefined) {
      aggregateAbortController = new AbortController()
      this.aggregateAbortControllers.set(k, aggregateAbortController)
    }

    let aggregateStatusReporter = this.aggregateStatusReporters.get(k)
    if (aggregateStatusReporter === undefined) {
      aggregateStatusReporter = new AggregateStatusReporter()
      this.aggregateStatusReporters.set(k, aggregateStatusReporter)
    }
    if (signal?.aborted) {
      throw new Error('aborted')
    }
    signal?.addEventListener('abort', () => {
      const val = this.currentlyAborted.get(k)
      if (val === undefined) {
        console.log('wow0', 1)
        this.currentlyAborted.set(k, 1)
      } else {
        console.log('wow', val + 1)
        this.currentlyAborted.set(k, val + 1)
      }
      if (this.currentlyWatching.get(k) === this.currentlyAborted.get(k)) {
        console.log(this.currentlyWatching.get(k), this.currentlyAborted.get(k))
        aggregateAbortController.abort()
      }
    })
    // @ts-expect-error
    if (rest.context?.statusCallback) {
      // @ts-expect-error
      aggregateStatusReporter.addCallback(rest.context?.statusCallback)
    }

    return Promise.race([
      super.fetch(k, {
        ...rest,
        signal: aggregateAbortController.signal,
        context: {
          ...rest.context,
          statusCallback: (arg: unknown) => {
            console.log('WOWOWOWOW', arg)
            aggregateStatusReporter.callback(arg)
          },
        },
      }),
      new Promise<V | undefined>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new Error('aborted'))
        })
      }),
    ])
  }

  delete(key: K) {
    const abortController = this.aggregateAbortControllers.get(key)
    if (abortController) {
      abortController.abort()
    }
    this.aggregateAbortControllers.delete(key)
    this.currentlyAborted.delete(key)
    this.currentlyWatching.delete(key)
    return super.delete(key)
  }

  clear() {
    for (const val of this.aggregateAbortControllers.values()) {
      val.abort()
    }
    this.aggregateAbortControllers.clear()
    this.currentlyWatching.clear()
    this.currentlyAborted.clear()
    super.clear()
  }
}
