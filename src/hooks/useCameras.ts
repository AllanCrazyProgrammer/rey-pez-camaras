import { useCallback, useEffect, useState } from 'react';
import type { CameraConfig, DvrSettings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';
import { DEFAULT_CAMERAS } from '../data/defaultCameras';
import { buildHlsUrl, readBridgeFromHash, streamName } from '../lib/rtsp';

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
    const parsed = JSON.parse(raw) as CameraConfig[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_CAMERAS;
    // Solo se aceptan canales 1..16 del XVR; el resto se ignora.
    return parsed.filter((c) => c.channel >= 1 && c.channel <= 16);
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

  const updateCamera = useCallback((id: number, patch: Partial<CameraConfig>) => {
    setCameras((prev) =>
      prev.map((cam) => (cam.id === id ? { ...cam, ...patch } : cam)),
    );
  }, []);

  /** URL HLS de una cámara: substream en mosaico, principal en vista grande. */
  const hlsUrlFor = useCallback(
    (camera: CameraConfig, main: boolean): string | null =>
      buildHlsUrl(settings.bridgeUrl, streamName(camera.channel, main)),
    [settings.bridgeUrl],
  );

  const activeCameras = cameras.filter((c) => c.enabled);

  return { settings, updateSettings, cameras, activeCameras, updateCamera, hlsUrlFor };
}
