export type DraftWriter = { run<T>(operation: () => Promise<T>): Promise<T>; release(): Promise<void> };
export type DraftWriterResult = { status: 'owned'; writer: DraftWriter } | { status: 'busy' | 'unavailable' };
export function acquireDraftWriter(): Promise<DraftWriterResult> {
  if (!globalThis.navigator?.locks) return Promise.resolve({ status: 'unavailable' });
  return new Promise(resolve => {
    void navigator.locks.request('beadrelief:draft-writer', { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (!lock) { resolve({ status: 'busy' }); return; }
      let releasing = false;
      const pending = new Set<Promise<unknown>>();
      let unlock!: () => void;
      const held = new Promise<void>(done => { unlock = done; });
      let released: Promise<void> | undefined;
      resolve({ status: 'owned', writer: {
        run<T>(operation: () => Promise<T>): Promise<T> {
          if (releasing) return Promise.reject(new Error('Draft writer released'));
          const task = Promise.resolve().then(operation);
          pending.add(task);
          void task.then(() => pending.delete(task), () => pending.delete(task));
          return task;
        },
        release() {
          releasing = true;
          return released ??= Promise.allSettled([...pending]).then(() => { unlock(); });
        },
      } });
      await held;
    }).catch(() => resolve({ status: 'unavailable' }));
  });
}
