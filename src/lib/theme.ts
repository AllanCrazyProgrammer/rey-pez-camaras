/**
 * Temas de la interfaz. Solo cambian la apariencia (src/themes/*.css):
 * se pone data-theme="…" en <html> y cada tema ajusta colores y formas.
 * Cada aparato recuerda el suyo.
 */

export type ThemeId =
  | 'clasico'
  | 'osd'
  | 'cyberpunk'
  | 'aero'
  | 'minimal'
  | 'w95'
  | 'yermo'
  | 'vaporwave';

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  description: string;
  /** Colores para la muestra en Ajustes: fondo, superficie, acento, extra. */
  swatches: [string, string, string, string];
}

export const THEMES: ThemeInfo[] = [
  { id: 'clasico', name: 'Clásico', description: 'El de siempre, más limpio.', swatches: ['#141412', '#262622', '#c85a17', '#4caf7d'] },
  { id: 'osd', name: 'Menú OSD azul', description: 'Menús azules de videocasetera.', swatches: ['#000000', '#0b2fa8', '#ffffff', '#ffe600'] },
  { id: 'cyberpunk', name: 'Cyberpunk', description: 'Neón rosa y cian, esquinas cortadas.', swatches: ['#0b0217', '#1c0838', '#ff2a6d', '#05d9e8'] },
  { id: 'aero', name: 'Frutiger Aero', description: 'Cielo, vidrio brillante y burbujas.', swatches: ['#bfe9ff', '#ffffff', '#1e9be8', '#5cc93b'] },
  { id: 'minimal', name: 'Minimalista oscuro', description: 'Negro, sin adornos, un solo color.', swatches: ['#000000', '#0e0e0f', '#8a8a8e', '#ff5a36'] },
  { id: 'w95', name: 'Escritorio 95', description: 'Ventanas grises con relieve.', swatches: ['#008080', '#c0c0c0', '#000080', '#ffffe1'] },
  { id: 'yermo', name: 'Yermo de vapor', description: 'Steampunk post apocalíptico, óxido y cobre.', swatches: ['#c96a2b', '#4a3f36', '#5fa39a', '#e6d3a8'] },
  { id: 'vaporwave', name: 'Vaporwave Mac', description: 'Mac clásica sobre atardecer neón.', swatches: ['#ff71ce', '#ffffff', '#01cdfe', '#b967ff'] },
];

const THEME_KEY = 'rey-pez-camaras:theme/v1';

export function readTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v && THEMES.some((t) => t.id === v)) return v as ThemeId;
  } catch {
    /* sin storage */
  }
  return 'clasico';
}

/** Aplica el tema (y lo guarda). Avisa con el evento "themechange". */
export function applyTheme(id: ThemeId, save = true): void {
  document.documentElement.dataset.theme = id;
  if (save) {
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      /* solo esta visita */
    }
  }
  window.dispatchEvent(new CustomEvent('themechange', { detail: id }));
}
