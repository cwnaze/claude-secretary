'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HomeState } from './types';

const REFRESH_MS = 60_000;

// Fetches /api/home for `date` (null = today), refreshing every minute and when the tab regains focus,
// so a pinned tab keeps up with the vault and the clock.
export function useHome(date: string | null): HomeState {
  const [state, setState] = useState<HomeState>({ status: 'loading' });
  const req = useRef(0);

  const load = useCallback(async () => {
    const id = ++req.current;
    try {
      const res = await fetch(`/api/home${date ? `?date=${date}` : ''}`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (id !== req.current) return;
      if (res.ok && body) setState({ status: 'ready', data: body });
      else if (res.status === 503) setState({ status: 'not_set_up', message: body?.message ?? '' });
      else setState({ status: 'offline' });
    } catch {
      if (id === req.current) setState({ status: 'offline' });
    }
  }, [date]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onFocus); };
  }, [load]);

  return state;
}
