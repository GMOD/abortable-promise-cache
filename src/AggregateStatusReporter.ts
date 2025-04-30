export default class AggregateStatusReporter<V> {
  callbacks = new Set<(arg: V) => void>()
  currentMessage?: V

  addCallback(callback: (arg: V) => void = () => {}): void {
    this.callbacks.add(callback)
    if (this.currentMessage) {
      callback(this.currentMessage)
    }
  }

  callback(message: V) {
    this.currentMessage = message
    for (const elt of this.callbacks) {
      elt(message)
    }
  }
}
