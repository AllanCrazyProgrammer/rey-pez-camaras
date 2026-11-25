import type { CameraConfig } from '../lib/types';

/**
 * Cámaras de la bodega Rey Pez: 16 del Dahua y 16 del Hikvision.
 * Nombres genéricos a propósito: Allan los renombra en la app
 * (Ajustes o lápiz ✎ del mosaico) y se comparten vía la Mac mini.
 */
export const HIK_ID_OFFSET = 100;

/** Canales sin imagen: ocultos de inicio (se activan en Ajustes). */
const DAHUA_HIDDEN = new Set([4, 14]);
const HIK_HIDDEN = new Set([5, 14, 16]);

const dahua: CameraConfig[] = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1,
  dvr: 'dahua',
  channel: i + 1,
  name: `Cámara ${i + 1}`,
  location: 'Bodega',
  enabled: !DAHUA_HIDDEN.has(i + 1),
}));

const hik: CameraConfig[] = Array.from({ length: 16 }, (_, i) => ({
  id: HIK_ID_OFFSET + i + 1,
  dvr: 'hik',
  channel: i + 1,
  name: `Hikvision ${i + 1}`,
  location: 'Bodega',
  enabled: !HIK_HIDDEN.has(i + 1),
}));

export const DEFAULT_CAMERAS: CameraConfig[] = [...dahua, ...hik];

/** "Dahua · Canal 3" / "Hikvision · Canal 3", para mostrar de dónde sale. */
export function channelLabel(cam: Pick<CameraConfig, 'dvr' | 'channel'>): string {
  return `${cam.dvr === 'hik' ? 'Hikvision' : 'Dahua'} · Canal ${cam.channel}`;
}
