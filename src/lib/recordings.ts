import type { CameraConfig } from './types';
import { normalizeBridgeUrl } from './rtsp';

/**
 * Grabaciones de los DVR, a través del servicio "grabaciones" de la Mac mini
 * (publicado en /grabaciones del mismo puente). Las horas son la hora REAL
 * de la bodega: si el reloj de un DVR está desfasado, la Mac mini lo corrige.
 */

export interface Tramo {
  /** "HH:MM:SS" */
  inicio: string;
  /** "HH:MM:SS" ("24:00:00" = hasta el final del día) */
  fin: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha local "AAAA-MM-DD". */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Segundos desde medianoche → "HH:MM:SS". */
export function hms(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Segundos desde medianoche → hora de 12 h, ej. "5:59:34 PM" o "5:59 PM". */
export function hora12(sec: number, seconds = true): string {
  const s = Math.max(0, Math.round(sec)) % 86400;
  const h = Math.floor(s / 3600);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = pad(Math.floor((s % 3600) / 60));
  return `${h12}:${mm}${seconds ? `:${pad(s % 60)}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "HH:MM:SS" → segundos desde medianoche. */
export function toSec(t: string): number {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function endpoint(bridgeUrl: string, params: Record<string, string>): string | null {
  const base = normalizeBridgeUrl(bridgeUrl);
  if (!base) return null;
  return `${base}/grabaciones?${new URLSearchParams(params).toString()}`;
}

async function call<T>(url: string | null): Promise<T> {
  if (!url) throw new Error('Sin puente configurado');
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new Error('No se pudo conectar con la Mac mini');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

/** Tramos grabados de una cámara en un día. */
export function fetchTramos(bridgeUrl: string, cam: CameraConfig, fecha: string) {
  return call<{ tramos: Tramo[]; desfaseSeg: number }>(
    endpoint(bridgeUrl, { accion: 'lista', dvr: cam.dvr, canal: String(cam.channel), fecha }),
  );
}

/**
 * Prepara la reproducción desde `fecha` + `segundos`. Devuelve el nombre del
 * stream de go2rtc (grab1…grab4) que se reproduce como cualquier cámara.
 * `liberar` = el stream que este aparato estaba usando.
 */
export function startPlayback(
  bridgeUrl: string,
  cam: CameraConfig,
  fecha: string,
  segundos: number,
  liberar?: string,
) {
  const params: Record<string, string> = {
    accion: 'ver',
    dvr: cam.dvr,
    canal: String(cam.channel),
    inicio: `${fecha}T${hms(Math.min(segundos, 86399))}`,
  };
  if (liberar) params.liberar = liberar;
  return call<{ stream: string }>(endpoint(bridgeUrl, params));
}
