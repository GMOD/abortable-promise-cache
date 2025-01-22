export function isAbortException(exception: Error) {
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
