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

/** Misma URL con la clave tapada, segura para mostrar en pantalla. */export function maskRtspUrlSafe(settings: DvrSettings, channel: number, subtype: 0 | 1): string {
  // Construir la versión enmascarada sin pasar por la clave real.
  const host = settings.dvrIp.trim() || '<IP-DEL-DVR>';
  const user = settings.username.trim() || 'admin';
  return `rtsp://${user}:••••@${host}:554/cam/realmonitor?channel=${channel}&subtype=${subtype}`;
}

/** Nombre del stream en go2rtc: cam1 (principal), cam1sub (substream). */
export function streamName(channel: number, main: boolean): string {
  return main ? `cam${channel}` : `cam${channel}sub`;
}

/** URL HLS que sirve go2rtc para un stream. null si no hay puente configurado. */
export function buildHlsUrl(bridgeUrl: string, stream: string): string | null {
  const base = bridgeUrl.trim().replace(/\/$/, '');
  if (!base) return null;
  return `${base}/api/stream.m3u8?src=${encodeURIComponent(stream)}`;
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
    '# Pegar en la compu de la bodega junto al binario de go2rtc.',
    '# NO subir este archivo a GitHub: lleva la clave del DVR.',
    '# Docs: https://github.com/AlexxIT/go2rtc',
    '',
    'streams:',
  ];
  for (const cam of active) {
    lines.push(`  ${streamName(cam.channel, true)}: ${buildRtspUrl(settings, cam.channel, 0)}`);
    lines.push(`  ${streamName(cam.channel, false)}: ${buildRtspUrl(settings, cam.channel, 1)}`);
  }
  lines.push('', 'api:');
  lines.push('  listen: ":1984"');
  lines.push('');
  return lines.join('\n');
}
