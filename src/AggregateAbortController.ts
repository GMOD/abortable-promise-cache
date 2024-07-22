class NullSignal {}

/**
 * aggregates a number of abort signals, will only fire the aggregated
 * abort if all of the input signals have been aborted
 */
export default class AggregateAbortController {
  signals = new Set()
  abortController = new AbortController()

  /**
   * @param {AbortSignal} [signal] optional AbortSignal to add. if falsy,
   *  will be treated as a null-signal, and this abortcontroller will no
   *  longer be abortable.
   */
  //@ts-ignore
  addSignal(signal: AbortSignal = new NullSignal()): void {
    if (this.signal.aborted) {
      throw new Error('cannot add a signal, already aborted!')
    }

    // note that a NullSignal will never fire, so if we
    // have one this thing will never actually abort
    this.signals.add(signal)
    if (signal.aborted) {
      // handle the abort immediately if it is already aborted
      // for some reason
      this.handleAborted(signal)
    } else if (typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', () => {
        this.handleAborted(signal)
      })
    }
  }

  handleAborted(signal: AbortSignal): void {
    this.signals.delete(signal)
    if (this.signals.size === 0) {
      this.abortController.abort()
    }
  }

  get signal(): AbortSignal {
    return this.abortController.signal
  }

  abort(): void {
    this.abortController.abort()
  }
}
