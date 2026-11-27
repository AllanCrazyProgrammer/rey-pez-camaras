import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Galería del teléfono y WhatsApp (solo en la APK; plugin propio "Galeria"
 * en android/app/src/main/java/com/reypez/camaras/GaleriaPlugin.java).
 * Fotos y clips quedan en DCIM/Camaras Rey Pez, donde los ve Google Fotos.
 */

interface GaleriaPlugin {
  guardar(o: { data: string; mime: string; nombre: string }): Promise<{ uri: string; carpeta: string }>;
  whatsapp(o: { uri: string; mime: string; texto?: string }): Promise<{ app: string }>;
}

const Galeria = registerPlugin<GaleriaPlugin>('Galeria');

export const GALLERY_FOLDER = 'Camaras Rey Pez';

/** true en una APK que ya trae el plugin (las APK viejas no). */
export function galleryAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Galeria');
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(blob);
  });
}

/** Algo ya guardado que se puede volver a compartir. */
export interface SavedMedia {
  kind: 'foto' | 'clip';
  name: string;
  blob: Blob;
  /** content:// de la galería (solo APK). */
  uri?: string;
}

export async function saveToGallery(blob: Blob, nombre: string): Promise<string> {
  const { uri } = await Galeria.guardar({
    data: await blobToBase64(blob),
    mime: blob.type || 'application/octet-stream',
    nombre,
  });
  return uri;
}

const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Se puede ofrecer "Compartir por WhatsApp" para este archivo. */
export function canShareWhatsApp(m: SavedMedia): boolean {
  if (m.uri && galleryAvailable()) return true;
  if (!TOUCH || typeof navigator.canShare !== 'function') return false;
  return navigator.canShare({ files: [new File([m.blob], m.name, { type: m.blob.type })] });
}

/**
 * APK: abre WhatsApp directo con el archivo (si no está, el menú de compartir).
 * Navegador del celular: menú de compartir del sistema (ahí se elige WhatsApp).
 */
export async function shareWhatsApp(m: SavedMedia): Promise<void> {
  if (m.uri && galleryAvailable()) {
    await Galeria.whatsapp({ uri: m.uri, mime: m.blob.type || '*/*' });
    return;
  }
  try {
    await navigator.share({ files: [new File([m.blob], m.name, { type: m.blob.type })] });
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return;
    throw err;
  }
}
