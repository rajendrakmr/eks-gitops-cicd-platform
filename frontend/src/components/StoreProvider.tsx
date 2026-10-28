'use client';

import { useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from '@/store';
import { hydrate } from '@/store/authSlice';

const STORAGE_KEY = 'shopstream.auth';

export default function StoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) storeRef.current = makeStore();

  useEffect(() => {
    const store = storeRef.current!;

    // Restore the session after mount (localStorage does not exist during SSR).
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      store.dispatch(hydrate(raw ? JSON.parse(raw) : null));
    } catch {
      store.dispatch(hydrate(null));
    }

    // Persist auth changes (login, silent refresh, logout).
    let last = store.getState().auth;
    return store.subscribe(() => {
      const auth = store.getState().auth;
      if (auth === last) return;
      last = auth;
      try {
        if (auth.accessToken) {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ user: auth.user, accessToken: auth.accessToken, refreshToken: auth.refreshToken })
          );
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        /* storage unavailable (private mode), session just won't persist */
      }
    });
  }, []);

  return <Provider store={storeRef.current}>{children}</Provider>;
}
