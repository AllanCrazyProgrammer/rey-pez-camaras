import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraConfig, DvrSettings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';
import { DEFAULT_CAMERAS } from '../data/defaultCameras';
import { buildHlsUrl, readBridgeFromHash, streamName } from '../lib/rtsp';
import {
  fetchSharedNames,
  mergeShared,
  moveCameraInList,
  saveSharedNames,
  type NamesSyncStatus,
} from '../lib/namesSync';

/** Cada cuánto se revisan cambios hechos en otro aparato. */
const NAMES_REFRESH_MS = 60_000;
/** Espera tras la última tecla antes de guardar en la Mac mini. */
const NAMES_SAVE_DELAY_MS = 800;

const SETTINGS_KEY = 'rey-pez-camaras:settings/v1';
const CAMERAS_KEY = 'rey-pez-camaras:cameras/v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) } as T;
  } catch {
    return fallback;
  }
}

function readCameras(): CameraConfig[] {
  try {
    const raw = localStorage.getItem(CAMERAS_KEY);
    if (!raw) return DEFAULT_CAMERAS;
    const parsed = JSON.parse(raw) as Partial<CameraConfig>[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_CAMERAS;
    const byId = new Map(DEFAULT_CAMERAS.map((c) => [c.id, c]));
    // Solo cámaras conocidas (Dahua 1..16, Hikvision 101..116). Las listas
    // guardadas antes de agregar el Hikvision no traían `dvr`: se toma de
    // la lista base, que manda en dvr y canal.
    const saved = parsed.flatMap((c) => {
      const base = typeof c?.id === 'number' ? byId.get(c.id) : undefined;
      return base ? [{ ...base, ...c, dvr: base.dvr, channel: base.channel }] : [];
    });
    // Cámaras nuevas (ej. Dahua 15-16 y el Hikvision) se agregan al final.
    const known = new Set(saved.map((c) => c.id));
    return [...saved, ...DEFAULT_CAMERAS.filter((c) => !known.has(c.id))];
  } catch {
    return DEFAULT_CAMERAS;
  }
}

/**
 * Estado global de la app: ajustes del DVR + cámaras.
 * Persiste en localStorage (nunca en el repo). Las actualizaciones son
 * por cámara (updateCamera) para no re-renderizar todo el mosaico.
 */
export function useCameras() {
  const [settings, setSettings] = useState<DvrSettings>(() => {
    const saved = readJson<DvrSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);
    // Link de configuración rápida (#puente=https://…ts.net): guarda el
    // puente en este navegador y limpia la dirección de la barra.
    const fromLink = readBridgeFromHash(globalThis.location?.hash ?? '');
    if (!fromLink) return saved;
    history.replaceState(null, '', location.pathname + location.search);
    return { ...saved, bridgeUrl: fromLink };
  });
  const [cameras, setCameras] = useState<CameraConfig[]>(readCameras);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* Navegador sin storage: la app sigue funcionando en memoria. */
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(CAMERAS_KEY, JSON.stringify(cameras));
    } catch {
      /* idem */
    }
  }, [cameras]);

  const updateSettings = useCallback((patch: Partial<DvrSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  // --- Nombres compartidos en la Mac mini ---------------------------------
  const [namesStatus, setNamesStatus] = useState<NamesSyncStatus>('local');
  /** true mientras hay una edición local que todavía no llega a la Mac mini. */
  const dirtyRef = useRef(false);
  const camerasRef = useRef(cameras);
  useEffect(() => {
    camerasRef.current = cameras;
  }, [cameras]);

  // Bajar nombres al abrir, al volver a la pestaña y cada minuto.
  useEffect(() => {
    if (!settings.bridgeUrl.trim()) return;
    let ctrl: AbortController | null = null;
    const pull = async (first: boolean) => {
      if (dirtyRef.current) return;
      ctrl?.abort();
      ctrl = new AbortController();
      if (first) setNamesStatus('loading');
      try {
        const shared = await fetchSharedNames(settings.bridgeUrl, ctrl.signal);
        if (dirtyRef.current) return;
        if (shared && shared.length > 0) {
          setCameras((prev) => mergeShared(prev, shared));
        } else {
          // La Mac mini aún no tiene nombres: sube los de este aparato.
          await saveSharedNames(settings.bridgeUrl, camerasRef.current);
        }
        setNamesStatus('synced');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setNamesStatus('error');
      }
    };
    void pull(true);
    const timer = setInterval(() => void pull(false), NAMES_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pull(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      ctrl?.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [settings.bridgeUrl]);

  // Subir cambios locales (con una pequeña espera para no mandar cada tecla).
  useEffect(() => {
    if (!dirtyRef.current || !settings.bridgeUrl.trim()) return;
    setNamesStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await saveSharedNames(settings.bridgeUrl, cameras);
        dirtyRef.current = false;
        setNamesStatus('synced');
      } catch {
        dirtyRef.current = false;
        setNamesStatus('error');
      }
    }, NAMES_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [cameras, settings.bridgeUrl]);

  const updateCamera = useCallback((id: number, patch: Partial<CameraConfig>) => {
    dirtyRef.current = true;
    setCameras((prev) =>
      prev.map((cam) => (cam.id === id ? { ...cam, ...patch } : cam)),
    );
  }, []);

  /** Arrastrar y soltar en el mosaico: se guarda en la Mac mini para todos. */
  const moveCamera = useCallback((fromId: number, toId: number) => {
    setCameras((prev) => {
      const next = moveCameraInList(prev, fromId, toId);
      if (next !== prev) dirtyRef.current = true;
      return next;
    });
  }, []);

  /** URL HLS de una cámara: substream en mosaico, principal en vista grande. */
  const hlsUrlFor = useCallback(
    (camera: CameraConfig, main: boolean): string | null =>
      buildHlsUrl(settings.bridgeUrl, streamName(camera, main)),
    [settings.bridgeUrl],
  );

  const activeCameras = cameras.filter((c) => c.enabled);

  return {
    settings,
    updateSettings,
    cameras,
    activeCameras,
    updateCamera,
    moveCamera,
    hlsUrlFor,
    // Sin puente no hay Mac mini con quien sincronizar.
    namesStatus: settings.bridgeUrl.trim() ? namesStatus : ('local' as const),
  };
}
