import { useEffect, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    fn()
      .then((result) => {
        if (!canceled) {
          setData(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (!canceled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  return { data, error, loading, reload: () => setReloadKey((k) => k + 1) };
}
