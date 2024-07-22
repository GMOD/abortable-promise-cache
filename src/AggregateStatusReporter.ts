export default class AggregateStatusReporter {
  callbacks = new Set<Function>()
  currentMessage: unknown

  addCallback(callback: Function = () => {}): void {
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
