import type { CameraConfig } from './types';
import { normalizeBridgeUrl } from './rtsp';

/**
 * Nombres y orden compartidos: la Mac mini guarda nombre/ubicación/activa
 * y el orden del mosaico de cada cámara en /nombres (detrás de Tailscale Serve), así todos los aparatos
 * ven los mismos. Si no responde, la app sigue con lo guardado en este
 * navegador.
 */
export type NamesSyncStatus = 'local' | 'loading' | 'synced' | 'saving' | 'error';

export interface SharedCamera {
  id: number;
  name: string;
  location: string;
  enabled: boolean;
}

function namesUrl(bridgeUrl: string): string | null {
  const base = normalizeBridgeUrl(bridgeUrl);
  return base ? `${base}/nombres` : null;
}

function parse(data: unknown): SharedCamera[] | null {
  const list = (data as { cameras?: unknown })?.cameras;
  if (!Array.isArray(list)) return null;
  return list
    .filter((c) => Number.isInteger(c?.id) && typeof c?.name === 'string')
    .map((c) => ({
      id: c.id,
      name: c.name,
      location: typeof c.location === 'string' ? c.location : '',
      enabled: c.enabled !== false,
    }));
}

export async function fetchSharedNames(
  bridgeUrl: string,
  signal?: AbortSignal,
): Promise<SharedCamera[] | null> {
  const url = namesUrl(bridgeUrl);
  if (!url) return null;
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`nombres ${res.status}`);
  return parse(await res.json());
}

export async function saveSharedNames(
  bridgeUrl: string,
  cameras: CameraConfig[],
): Promise<void> {
  const url = namesUrl(bridgeUrl);
  if (!url) return;
  const body = {
    cameras: cameras.map(({ id, name, location, enabled }) => ({ id, name, location, enabled })),
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`nombres ${res.status}`);
}

/**
 * Aplica lo que hay en la Mac mini sobre la lista local (por id): nombre,
 * ubicación, activa y también el orden del mosaico.
 */
export function mergeShared(local: CameraConfig[], shared: SharedCamera[]): CameraConfig[] {
  const byId = new Map(shared.map((c) => [c.id, c]));
  const position = new Map(shared.map((c, i) => [c.id, i]));
  let changed = false;
  const updated = local.map((cam) => {
    const s = byId.get(cam.id);
    if (!s) return cam;
    if (s.name === cam.name && s.location === cam.location && s.enabled === cam.enabled) return cam;
    changed = true;
    return { ...cam, name: s.name, location: s.location, enabled: s.enabled };
  });
  // Las que la Mac mini no conoce se quedan al final, en su orden actual.
  const UNKNOWN = Number.MAX_SAFE_INTEGER;
  const sorted = [...updated].sort(
    (a, b) => (position.get(a.id) ?? UNKNOWN) - (position.get(b.id) ?? UNKNOWN),
  );
  if (sorted.some((cam, i) => cam.id !== local[i].id)) changed = true;
  return changed ? sorted : local;
}

/** Mueve la cámara `fromId` al lugar que ocupa `toId`. */
export function moveCameraInList(
  list: CameraConfig[],
  fromId: number,
  toId: number,
): CameraConfig[] {
  const from = list.findIndex((c) => c.id === fromId);
  const to = list.findIndex((c) => c.id === toId);
  if (from === -1 || to === -1 || from === to) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
