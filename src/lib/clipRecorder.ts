import { Capacitor } from '@capacitor/core';
import { blobToBase64, galleryAvailable, saveToGallery } from './gallery';

/**
 * Grabar un clip de lo que se está viendo (en vivo o una grabación).
 * Se copian los cuadros del <video> a un canvas y el canvas se graba con
 * MediaRecorder. Así el clip sigue aunque cambie el video de origen (saltar
 * de hora, pausar) y funciona también en iPhone, donde <video> no se puede
 * grabar directo.
 */

const FPS = 15;
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function recordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype
  );
}

export interface ClipRecorder {
  pause: () => void;
  resume: () => void;
  /** Termina y entrega el clip. */
  stop: () => Promise<{ blob: Blob; ext: 'mp4' | 'webm' }>;
}

export function startClip(video: HTMLVideoElement): ClipRecorder {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador no puede grabar video');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  // Copia el cuadro actual cada 1/15 s (si el video tiene imagen).
  let last = 0;
  let raf = 0;
  const draw = (t: number) => {
    raf = requestAnimationFrame(draw);
    if (t - last < 1000 / FPS - 2) return;
    last = t;
    if (video.readyState >= 2 && video.videoWidth) ctx.drawImage(video, 0, 0, w, h);
  };
  raf = requestAnimationFrame(draw);
  // En segundo plano requestAnimationFrame se detiene; esto sigue copiando.
  const backup = setInterval(() => {
    if (document.hidden && video.readyState >= 2 && video.videoWidth) ctx.drawImage(video, 0, 0, w, h);
  }, 1000 / FPS);

  const mime = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  const stream = canvas.captureStream(FPS);
  const rec = new MediaRecorder(stream, {
    ...(mime ? { mimeType: mime } : {}),
    videoBitsPerSecond: 4_000_000,
  });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.start(1000);

  const cleanup = () => {
    cancelAnimationFrame(raf);
    clearInterval(backup);
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    pause: () => rec.state === 'recording' && rec.pause(),
    resume: () => rec.state === 'paused' && rec.resume(),
    stop: () =>
      new Promise((resolve, reject) => {
        const type = rec.mimeType || mime || 'video/webm';
        rec.onstop = () => {
          cleanup();
          if (!chunks.length) return reject(new Error('El clip quedó vacío'));
          resolve({ blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' });
        };
        if (rec.state === 'inactive') rec.onstop(new Event('stop'));
        else rec.stop();
      }),
  };
}

const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const CLIP_FOLDER = 'Camaras Rey Pez';

/**
 * Guarda el clip en el aparato:
 * - APK nueva: en la galería (DCIM/Camaras Rey Pez → Google Fotos).
 * - APK vieja: en la carpeta Documentos/Camaras Rey Pez del teléfono.
 * - Celular en navegador: menú "Compartir" (en iPhone: "Guardar video").
 * - Computadora: descarga el archivo.
 */
export async function saveClip(
  blob: Blob,
  filename: string,
): Promise<{ result: 'gallery' | 'saved' | 'shared' | 'downloaded' | 'cancelled'; uri?: string }> {
  if (galleryAvailable()) {
    return { result: 'gallery', uri: await saveToGallery(blob, filename) };
  }
  if (Capacitor.isNativePlatform()) {
    if (!Capacitor.isPluginAvailable('Filesystem')) throw new Error('APK_SIN_PLUGINS');
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({
      path: `${CLIP_FOLDER}/${filename}`,
      data: await blobToBase64(blob),
      directory: Directory.Documents,
      recursive: true,
    });
    return { result: 'saved' };
  }

  const file = new File([blob], filename, { type: blob.type });
  if (TOUCH && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return { result: 'shared' };
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return { result: 'cancelled' };
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { result: 'downloaded' };
}
