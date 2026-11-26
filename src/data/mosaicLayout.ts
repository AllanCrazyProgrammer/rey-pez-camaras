import type { DvrKind } from '../lib/types';

/**
 * Mosaico ligero: la Mac mini junta las cámaras de cada DVR en un solo
 * video 1920x1080 (cuadrícula de 4x4, cada cuadro 480x270), con ffmpeg
 * (~/go2rtc/mosaico.sh). Aquí va el mismo orden de canales que usa la Mac
 * mini, de izquierda a derecha y de arriba a abajo, para saber qué cámara
 * es cada cuadro. Si se cambia la lista en la Mac mini, cambiarla aquí.
 */
export const MOSAIC_COLS = 4;

export const MOSAIC_STREAM: Record<DvrKind, string> = {
  dahua: 'mosaico_dahua',
  hik: 'mosaico_hik',
};

export const MOSAIC_CHANNELS: Record<DvrKind, number[]> = {
  dahua: [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16],
  hik: [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 15],
};
