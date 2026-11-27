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

/**
 * Hora escrita por el usuario → segundos del día. Acepta "5:37", "5.37",
 * "537", "5:37:20", "5:37 pm", "5:37p" y también "17:37". Si no trae AM/PM,
 * usa `ampm`. Devuelve null si no se entiende.
 */
export function parseHora(texto: string, ampm: 'AM' | 'PM'): number | null {
  const t = texto.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  const m = t.match(/^(\d{1,2})(?:[:.h ](\d{1,2}))?(?:[:.](\d{1,2}))?\s*(a|p)?\.?\s*m?\.?$/);
  let h: number, min: number, sec = 0, suf: string | undefined;
  if (m) {
    h = Number(m[1]);
    min = m[2] === undefined ? 0 : Number(m[2]);
    sec = m[3] === undefined ? 0 : Number(m[3]);
    suf = m[4];
  } else {
    // "537" o "0537" (sin separador)
    const d = t.match(/^(\d{3,4})\s*(a|p)?\.?\s*m?\.?$/);
    if (!d) return null;
    h = Number(d[1].slice(0, -2));
    min = Number(d[1].slice(-2));
    suf = d[2];
  }
  if (min > 59 || sec > 59 || h > 23) return null;
  if (h > 12 || (h === 0 && !suf)) return h * 3600 + min * 60 + sec; // ya viene en 24 h
  if (h === 0) h = 12;
  const pm = suf ? suf === 'p' : ampm === 'PM';
  const h24 = (h % 12) + (pm ? 12 : 0);
  return h24 * 3600 + min * 60 + sec;
}
