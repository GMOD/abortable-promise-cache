type Callback = (arg: unknown) => void

export default class AggregateStatusReporter {
  callbacks = new Set<Callback>()
  currentMessage: unknown

  addCallback(callback: Callback = () => {}): void {
    this.callbacks.add(callback)
    callback(this.currentMessage)
  }

  callback(message: unknown) {
    this.currentMessage = message
    for (const elt of this.callbacks) {
      elt(message)
    }
  }
}
