import { useCallback, useEffect, useRef, useState } from 'react';

export type Resource<T> =
  | { status: 'loading'; data: undefined; error: undefined; reload: () => void }
  | { status: 'ready'; data: T; error: undefined; reload: () => void }
  | { status: 'error'; data: undefined; error: Error; reload: () => void };

/** Small async loader with cancellation; avoids pulling in a data-fetching library. */
export function useResource<T>(load: () => Promise<T>, deps: readonly unknown[]): Resource<T> {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; data?: T; error?: Error }>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    loadRef
      .current()
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch((e: unknown) => !cancelled && setState({ status: 'error', error: e instanceof Error ? e : new Error('Something went wrong') }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload } as Resource<T>;
}
