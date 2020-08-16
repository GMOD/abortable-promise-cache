export default class AggregateStatusReporter {
  callbacks = new Set<Function>()

  addCallback(callback: Function = () => {}): void {
    this.callbacks.add(callback)
  }

  callback(message: unknown) {
    this.callbacks.forEach(elt => {
      elt(message)
    })
  }
}
