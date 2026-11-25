/** Tipos compartidos del visor de cámaras de la bodega Rey Pez. */

/** De qué DVR sale la cámara. */
export type DvrKind = 'dahua' | 'hik';

export interface CameraConfig {
  /** Identificador estable: Dahua = canal (1..16), Hikvision = 100 + canal (101..116). */
  id: number;
  /** DVR de la cámara. */
  dvr: DvrKind;
  /** Canal dentro de su DVR (1..16 en ambos). */
  channel: number;
  /** Nombre editable que ve Allan, ej. "Entrada principal". */
  name: string;
  /** Ubicación editable, ej. "Portón norte". */
  location: string;
  /** Si está apagada no se genera stream ni se muestra en el mosaico. */
  enabled: boolean;
}

export interface DvrSettings {
  /** IP local del DVR en la bodega, ej. 192.168.1.108. Se guarda solo en el navegador. */
  dvrIp: string;
  /** Usuario del DVR (normalmente `admin`). */
  username: string;
  /** Clave del DVR. Solo vive en localStorage de este navegador, nunca en el repo. */
  password: string;
  /** IP local del DVR Hikvision. Vacía = no se genera en el go2rtc.yaml. */
  hikIp: string;
  /** Usuario del Hikvision (de solo vista). */
  hikUsername: string;
  /** Clave del Hikvision. Igual que la del Dahua: solo en este navegador. */
  hikPassword: string;
  /**
   * Base del puente go2rtc. Desde la web (https) debe ser https, ej. la
   * dirección de Tailscale Serve: https://mac-mini.tu-red.ts.net
   */
  bridgeUrl: string;
  /** Columnas del mosaico. */
  gridCols: 2 | 3 | 4;
}

export type StreamStatus =
  | 'idle'
  | 'no-bridge'
  /** Puente http:// desde la app https://: el navegador lo bloquea. */
  | 'insecure'
  | 'loading'
  /** Falló y está volviendo a intentar solo. */
  | 'reconnecting'
  | 'playing'
  | 'error';

export const DEFAULT_SETTINGS: DvrSettings = {
  dvrIp: '',
  username: 'admin',
  password: '',
  hikIp: '',
  hikUsername: 'admin',
  hikPassword: '',
  bridgeUrl: '',
  gridCols: 3,
};
