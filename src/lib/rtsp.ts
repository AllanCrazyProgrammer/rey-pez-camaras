import type { CameraConfig, DvrSettings } from './types';

type CamRef = Pick<CameraConfig, 'dvr' | 'channel'>;

/**
 * URLs RTSP de los dos DVR (el navegador no puede reproducir RTSP: el
 * puente go2rtc de la bodega lo convierte a HLS y la app consume ese HLS).
 * - Dahua DH-XVR1B16H-I/T: /cam/realmonitor?channel=N&subtype=0|1
 * - Hikvision DS-7216HQHI-K1: /Streaming/Channels/N01 (principal) y N02 (sub)
 * subtype 0 = principal (vista grande) · 1 = substream (mosaico).
 */
function rtspParts(settings: DvrSettings, cam: CamRef) {
  if (cam.dvr === 'hik') {
    return {
      host: settings.hikIp.trim() || '<IP-DEL-HIKVISION>',
      user: settings.hikUsername.trim() || 'admin',
      password: settings.hikPassword,
    };
  }
  return {
    host: settings.dvrIp.trim() || '<IP-DEL-DVR>',
    user: settings.username.trim() || 'admin',
    password: settings.password,
  };
}

function rtspPath(cam: CamRef, subtype: 0 | 1): string {
  return cam.dvr === 'hik'
    ? `/Streaming/Channels/${cam.channel}0${subtype + 1}`
    : `/cam/realmonitor?channel=${cam.channel}&subtype=${subtype}`;
}

export function buildRtspUrl(settings: DvrSettings, cam: CamRef, subtype: 0 | 1): string {
  const { host, user, password } = rtspParts(settings, cam);
  const pass = password ? encodeURIComponent(password) : '<CLAVE>';
  return `rtsp://${user}:${pass}@${host}:554${rtspPath(cam, subtype)}`;
}

/** Misma URL con la clave tapada, segura para mostrar en pantalla. */
export function maskRtspUrlSafe(settings: DvrSettings, cam: CamRef, subtype: 0 | 1): string {
  // Construir la versión enmascarada sin pasar por la clave real.
  const { host, user } = rtspParts(settings, cam);
  return `rtsp://${user}:••••@${host}:554${rtspPath(cam, subtype)}`;
}

/**
 * Nombre del stream en go2rtc: cam1 / cam1sub (Dahua), hik1 / hik1sub
 * (Hikvision).
 */
export function streamName(cam: CamRef, main: boolean): string {
  const base = `${cam.dvr === 'hik' ? 'hik' : 'cam'}${cam.channel}`;
  return main ? base : `${base}sub`;
}

/** Hosts que el navegador trata como seguros aunque vayan por http://. */
function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '[::1]' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

/**
 * Limpia la dirección del puente: quita espacios y "/" final.
 * Si no trae http(s)://, usa http:// para IPs y localhost, y https://
 * para nombres (ej. mac-mini.tu-red.ts.net de Tailscale Serve).
 */
export function normalizeBridgeUrl(raw: string): string {
  const base = raw.trim().replace(/\/+$/, '');
  if (!base) return '';
  if (/^https?:\/\//i.test(base)) return base;
  const host = base.split(/[/:]/)[0].toLowerCase();
  const plainHttp = isLoopbackHost(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  return `${plainHttp ? 'http' : 'https'}://${base}`;
}

/**
 * true si el navegador va a bloquear el puente por "contenido mixto":
 * la app está en https:// (GitHub Pages) y el puente es http:// (que no
 * sea localhost). Chrome, Safari y Firefox no cargan ese video.
 */
export function isInsecureBridge(
  bridgeUrl: string,
  pageProtocol: string = globalThis.location?.protocol ?? 'https:',
): boolean {
  if (pageProtocol !== 'https:') return false;
  const normalized = normalizeBridgeUrl(bridgeUrl);
  if (!normalized) return false;
  try {
    const url = new URL(normalized);
    return url.protocol === 'http:' && !isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Link de configuración rápida: la dirección del puente va en el "#" de la
 * URL (el navegador no lo manda a GitHub ni queda en logs). Solo se aceptan
 * direcciones https de Tailscale (*.ts.net), para que un link ajeno no pueda
 * apuntar la app a otro servidor.
 */
const SETUP_HASH_KEY = 'puente';

export function isTailscaleBridge(bridgeUrl: string): boolean {
  try {
    const url = new URL(normalizeBridgeUrl(bridgeUrl));
    return url.protocol === 'https:' && url.hostname.endsWith('.ts.net');
  } catch {
    return false;
  }
}

/** Lee el puente de un hash tipo "#puente=https://mac.tailnet.ts.net". */
export function readBridgeFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const raw = params.get(SETUP_HASH_KEY);
  if (!raw) return null;
  const normalized = normalizeBridgeUrl(raw);
  return isTailscaleBridge(normalized) ? normalized : null;
}

/**
 * Lo que la persona pegue para configurar el puente: el link completo
 * (…#puente=https://…ts.net) o solo la dirección https://…ts.net.
 */
export function bridgeFromPasted(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const hashAt = trimmed.indexOf('#');
  if (hashAt !== -1) return readBridgeFromHash(trimmed.slice(hashAt));
  const normalized = normalizeBridgeUrl(trimmed);
  return isTailscaleBridge(normalized) ? normalized : null;
}

/** Link que, al abrirlo en otro aparato, deja guardado el puente ahí. */
export function buildSetupLink(pageUrl: string, bridgeUrl: string): string | null {
  if (!isTailscaleBridge(bridgeUrl)) return null;
  const base = pageUrl.split('#')[0];
  return `${base}#${SETUP_HASH_KEY}=${normalizeBridgeUrl(bridgeUrl)}`;
}

/** URL HLS que sirve go2rtc para un stream. null si no hay puente configurado. */
export function buildHlsUrl(bridgeUrl: string, stream: string): string | null {
  const base = normalizeBridgeUrl(bridgeUrl);
  if (!base) return null;
  // &mp4: segmentos fMP4 en vez de MPEG-TS. Con TS, hls.js solo llegaba a
  // meter el cuadro clave de cada segundo al buffer y el video no arrancaba.
  return `${base}/api/stream.m3u8?src=${encodeURIComponent(stream)}&mp4`;
}

/**
 * Genera el go2rtc.yaml para la compu de la bodega.
 * Este archivo SÍ lleva usuario/clave: vive solo en esa compu, nunca en el repo.
 */
export function generateGo2rtcYaml(
  settings: DvrSettings,
  cameras: CameraConfig[],
): string {
  // El Hikvision solo entra si ya tiene IP: con un marcador go2rtc fallaría.
  const hasHik = settings.hikIp.trim() !== '';
  const active = cameras.filter((c) => c.enabled && (c.dvr === 'dahua' || hasHik));
  const lines: string[] = [
    '# go2rtc.yaml — Rey Pez / Bodega (Dahua DH-XVR1B16H-I/T + Hikvision DS-7216HQHI-K1)',
    '# Pegar en la Mac mini (puente) junto al binario de go2rtc.',
    '# NO subir este archivo a GitHub: lleva las claves de los DVR.',
    '# Docs: https://github.com/AlexxIT/go2rtc',
    '#',
    '# Para verlo desde la web (https) sin que el navegador lo bloquee:',
    '#   tailscale serve --bg 1984',
    '# y en Ajustes, puente = https://<mac-mini>.<tu-red>.ts.net',
    '',
    'streams:',
  ];
  for (const cam of active) {
    lines.push(`  ${streamName(cam, true)}: ${buildRtspUrl(settings, cam, 0)}`);
    lines.push(`  ${streamName(cam, false)}: ${buildRtspUrl(settings, cam, 1)}`);
  }
  lines.push('', 'api:');
  // Solo escucha en la propia Mac mini; Tailscale Serve lo publica con
  // HTTPS solo para tus aparatos. Así go2rtc no queda abierto en la red.
  lines.push('  listen: "127.0.0.1:1984"');
  // CORS: permite que la web (github.io) lea el video del puente.
  lines.push('  origin: "*"');
  // RTSP y WebRTC de go2rtc tampoco se abren a la red.
  lines.push('', 'rtsp:', '  listen: "127.0.0.1:8554"');
  lines.push('', 'webrtc:', '  listen: "127.0.0.1:8555"');
  lines.push('');
  return lines.join('\n');
}
