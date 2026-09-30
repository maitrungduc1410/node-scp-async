import { abortError } from '../errors';

/**
 * Runs `worker` over `items` with at most `limit` in flight. The first failure (or an abort)
 * rejects immediately and stops scheduling new items. Items already running are left to settle
 * on their own because ssh2 SFTP transfers cannot be interrupted mid-file.
 */
export function runQueue<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (items.length === 0) return Promise.resolve();
  const max = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));

  return new Promise<void>((resolve, reject) => {
    let next = 0;
    let running = 0;
    let settled = false;

    const onAbort = () => fail(abortError(signal));
    signal?.addEventListener('abort', onAbort, { once: true });

    function finish(err?: unknown) {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      if (err === undefined) resolve();
      else reject(err);
    }

    function fail(err: unknown) {
      finish(err);
    }

    function launch() {
      if (settled) return;
      if (signal?.aborted) {
        fail(abortError(signal));
        return;
      }
      while (running < max && next < items.length) {
        const item = items[next++] as T;
        running++;
        worker(item).then(
          () => {
            running--;
            if (next >= items.length && running === 0) finish();
            else launch();
          },
          (err: unknown) => {
            running--;
            fail(err);
          },
        );
      }
    }

    if (signal?.aborted) {
      fail(abortError(signal));
      return;
    }
    launch();
  });
}

/** Rejects as soon as `signal` aborts, otherwise mirrors `promise`. */
export function withAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    promise.catch(() => {});
    return Promise.reject(abortError(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      promise.catch(() => {});
      reject(abortError(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}
