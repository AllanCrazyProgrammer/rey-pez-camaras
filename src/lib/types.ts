/** Tipos compartidos del visor de cámaras Dahua (bodega Rey Pez). */

export interface CameraConfig {
  /** Identificador estable (1..14). */
  id: number;
  /** Canal del DVR (1..16 en el DH-XVR1B16H-I/T). */
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
  | 'playing'
  | 'error';

export const DEFAULT_SETTINGS: DvrSettings = {
  dvrIp: '',
  username: 'admin',
  password: '',
  bridgeUrl: '',
  gridCols: 3,
};
