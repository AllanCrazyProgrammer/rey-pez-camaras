import type { CameraConfig } from '../lib/types';

/**
 * 14 cámaras activas alrededor de la bodega Rey Pez.
 * Nombres genéricos a propósito: Allan los renombra en la app
 * (Ajustes o lápiz ✎ del mosaico) y se comparten vía la Mac mini.
 */
export const ACTIVE_CAMERA_COUNT = 14;

export const DEFAULT_CAMERAS: CameraConfig[] = Array.from(
  { length: ACTIVE_CAMERA_COUNT },
  (_, i) => ({
    id: i + 1,
    channel: i + 1,
    name: `Cámara ${i + 1}`,
    location: 'Bodega',
    enabled: true,
  }),
);
