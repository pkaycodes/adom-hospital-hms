import { useCallback, useEffect, useState } from 'react';

export type ApiOptions = { method?: string; body?: unknown; signal?: AbortSignal };

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
    signal: options.signal,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`);
    (error as any).status = res.status;
    throw error;
  }
  return data as T;
}

export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((err) => {
        if (alive) setError(err.message || 'Unable to load data');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload, setData };
}
