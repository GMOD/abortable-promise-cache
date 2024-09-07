import { LRUCache } from 'lru-cache'
import AggregateStatusReporter from './AggregateStatusReporter'

export default class AbortablePromiseCache<
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  K extends {},
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  V extends {},
  FC = unknown,
> extends LRUCache<K, V, FC> {
  inflight = new Map<
    K,
    {
      count: number
      abortController: AbortController
      statusReporter: AggregateStatusReporter
    }
  >()

  async fetch(
    k: K,
    fetchOptions: LRUCache.FetchOptions<K, V, FC> = {},
  ): Promise<undefined | V> {
    const val = this.inflight.get(k)
    const val2 =
      val === undefined
        ? {
            count: 1,
            abortController: new AbortController(),
            statusReporter: new AggregateStatusReporter(),
          }
        : {
            ...val,
            count: val.count + 1,
          }
    this.inflight.set(k, val2)
    const { signal, ...rest } = fetchOptions

    if (signal?.aborted) {
      throw new Error('aborted')
    }
    const abortWatcher = () => {
      const val = this.inflight.get(k)
      if (val === undefined) {
        // unknown
        return
      }
      const currentCount = val.count - 1
      if (currentCount === 0) {
        val.abortController.abort()
        this.inflight.delete(k)
      }
    }
    signal?.addEventListener('abort', abortWatcher)
    // @ts-expect-error
    if (rest.context?.statusCallback) {
      // @ts-expect-error
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      val2.statusReporter.addCallback(rest.context.statusCallback)
    }
    try {
      return await Promise.race([
        // @ts-expect-error
        super.fetch(k, {
          ...rest,
          signal: val2.abortController.signal,
          context: {
            ...rest.context,
            statusCallback: (arg: unknown) => {
              const val = this.inflight.get(k)
              if (val) {
                val.statusReporter.callback(arg)
              }
            },
          },
        }),
        new Promise<V | undefined>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new Error('aborted'))
          })
        }),
      ])
    } finally {
      this.inflight.delete(k)
      signal?.removeEventListener('abort', abortWatcher)
    }
  }

  delete(key: K) {
    const val = this.inflight.get(key)
    if (val) {
      val.abortController.abort()
    }
    this.inflight.delete(key)
    return super.delete(key)
  }

  clear() {
    for (const val of this.inflight.values()) {
      val.abortController.abort()
    }
    this.inflight.clear()
    super.clear()
  }
}
