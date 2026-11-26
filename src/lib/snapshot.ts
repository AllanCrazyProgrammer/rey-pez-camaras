import { Capacitor } from '@capacitor/core';

/**
 * "Foto del momento": copia el cuadro actual del video a una imagen JPG.
 * Todo es síncrono hasta llamar a share(): iOS y Android solo dejan
 * abrir el menú de compartir justo después del toque del usuario.
 */
export function captureFrame(video: HTMLVideoElement): { blob: Blob; dataUrl: string } | null {
  if (!video.videoWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')?.drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const bin = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: 'image/jpeg' }), dataUrl };
}

/** Nombre del archivo: cámara + fecha y hora, ej. Afuera-2026-11-26_13-47-43.jpg */
export function snapshotName(cameraName: string, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  const safe = cameraName.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'camara';
  return `${safe}-${stamp}.jpg`;
}

export const APK_SIN_PLUGINS = 'APK_SIN_PLUGINS';

const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * Entrega la foto según el aparato:
 * - APK (Android): la guarda en caché y abre "Compartir" (Galería, WhatsApp, Drive…).
 *   El WebView no sabe descargar archivos, por eso antes no pasaba nada.
 * - Celular en navegador: menú "Compartir" del sistema (en iPhone: "Guardar imagen").
 * - Computadora: descarga el archivo.
 * Devuelve 'shared' | 'downloaded' | 'cancelled'.
 */
export async function deliverSnapshot(
  shot: { blob: Blob; dataUrl: string },
  filename: string,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (Capacitor.isNativePlatform()) {
    // Una APK vieja no trae estos plugins: la foto no se puede entregar.
    if (!Capacitor.isPluginAvailable('Filesystem') || !Capacitor.isPluginAvailable('Share')) {
      throw new Error(APK_SIN_PLUGINS);
    }
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: shot.dataUrl.split(',')[1],
      directory: Directory.Cache,
    });
    try {
      await Share.share({ title: filename, files: [uri] });
      return 'shared';
    } catch (err) {
      // Cerrar el menú sin elegir nada no es un error.
      if (/cancel/i.test(String((err as Error)?.message ?? err))) return 'cancelled';
      throw err;
    }
  }

  const file = new File([shot.blob], filename, { type: 'image/jpeg' });
  if (TOUCH && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
      // Si compartir falla por otra razón, se intenta descargar.
    }
  }

  const url = URL.createObjectURL(shot.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
