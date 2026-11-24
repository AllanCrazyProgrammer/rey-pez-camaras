import type { CameraConfig, DvrSettings } from './types';

/**
 * URLs RTSP del Dahua DH-XVR1B16H-I/T (verificado en DahuaWiki / docs Dahua).
 * Principal: subtype=0 · Substream (para mosaico): subtype=1.
 * El navegador NO puede reproducir RTSP directo: el puente go2rtc de la
 * bodega lo convierte a HLS/WebRTC y la app consume ese HLS.
 */
export function buildRtspUrl(
  settings: DvrSettings,
  channel: number,
  subtype: 0 | 1,
): string {
  const { username, password, dvrIp } = settings;
  const host = dvrIp.trim() || '<IP-DEL-DVR>';
  const user = username.trim() || 'admin';
  const pass = password ? encodeURIComponent(password) : '<CLAVE>';
  return `rtsp://${user}:${pass}@${host}:554/cam/realmonitor?channel=${channel}&subtype=${subtype}`;
}

/** Misma URL con la clave tapada, segura para mostrar en pantalla. */
export function maskRtspUrlSafe(settings: DvrSettings, channel: number, subtype: 0 | 1): string {
  // Construir la versión enmascarada sin pasar por la clave real.
  const host = settings.dvrIp.trim() || '<IP-DEL-DVR>';
  const user = settings.username.trim() || 'admin';
  return `rtsp://${user}:••••@${host}:554/cam/realmonitor?channel=${channel}&subtype=${subtype}`;
}

/** Nombre del stream en go2rtc: cam1 (principal), cam1sub (substream). */
export function streamName(channel: number, main: boolean): string {
  return main ? `cam${channel}` : `cam${channel}sub`;
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
  const active = cameras.filter((c) => c.enabled);
  const lines: string[] = [
    '# go2rtc.yaml — Rey Pez / Bodega (Dahua DH-XVR1B16H-I/T)',
    '# Pegar en la Mac mini (puente) junto al binario de go2rtc.',
    '# NO subir este archivo a GitHub: lleva la clave del DVR.',
    '# Docs: https://github.com/AlexxIT/go2rtc',
    '#',
    '# Para verlo desde la web (https) sin que el navegador lo bloquee:',
    '#   tailscale serve --bg 1984',
    '# y en Ajustes, puente = https://<mac-mini>.<tu-red>.ts.net',
    '',
    'streams:',
  ];
  for (const cam of active) {
    lines.push(`  ${streamName(cam.channel, true)}: ${buildRtspUrl(settings, cam.channel, 0)}`);
    lines.push(`  ${streamName(cam.channel, false)}: ${buildRtspUrl(settings, cam.channel, 1)}`);
  }
  lines.push('', 'api:');
  // Solo escucha en la propia Mac mini; Tailscale Serve lo publica con
  // HTTPS solo para tus aparatos. Así go2rtc no queda abierto en la red.
  lines.push('  listen: "127.0.0.1:1984"');
  // CORS: permite que la web (github.io) lea el video del puente.
  lines.push('  origin: "*"');
  lines.push('');
  return lines.join('\n');
}
