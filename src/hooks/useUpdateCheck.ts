import { useEffect, useState } from 'react';

const CHECK_EVERY_MS = 10 * 60_000;

/**
 * Revisa si se publicó una versión nueva de la web (version.json). En la app
 * de Android la web se carga desde internet, así que esto también actualiza
 * la app sin bajar otro APK.
 * - Al volver a la app (o al recuperar internet) con versión nueva: recarga.
 * - Con la app a la vista: avisa con un botón, para no cortar lo que ves.
 */
export function useUpdateCheck() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    let found = false;
    const check = async () => {
      if (found || !navigator.onLine) return found;
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' });
        if (!res.ok) return false;
        const { version } = (await res.json()) as { version?: string };
        if (version && version !== __APP_VERSION__) {
          found = true;
          setUpdateReady(true);
        }
      } catch {
        /* sin internet: se reintenta luego */
      }
      return found;
    };
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      if (await check()) location.reload();
    };
    const onOnline = () => void onVisible();
    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return updateReady;
}
