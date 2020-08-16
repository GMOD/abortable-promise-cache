export default class AggregateStatusReporter {
  callbacks = new Set<Function>()

  addCallback(callback: Function = () => {}): void {
    console.log('wtf', callback.toString())
    this.callbacks.add(callback)
  }

  callback(message: unknown) {
    console.log({ message, c: this.callbacks })
    this.callbacks.forEach(elt => {
      elt(message)
    })
  }
}
