/** Remembers answers by key, and lets callers that ask the same thing at once share one request. A failed answer is not kept. */
export function memoAsync<A extends unknown[], T>(key: (...a: A) => string, fn: (...a: A) => Promise<T>): (...a: A) => Promise<T> {
  const seen = new Map<string, Promise<T>>();
  return (...a) => {
    const k = key(...a);
    let p = seen.get(k);
    if (!p) {
      p = fn(...a);
      seen.set(k, p);
      p.catch(() => { if (seen.get(k) === p) seen.delete(k); });
    }
    return p;
  };
}
