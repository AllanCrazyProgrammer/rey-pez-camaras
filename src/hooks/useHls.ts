import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';
import type { StreamStatus } from '../lib/types';
import { isInsecureBridge } from '../lib/rtsp';

/**
 * Reproduce un HLS con hls.js (Chrome/Firefox/Android) o con el
 * reproductor nativo cuando el navegador ya entiende HLS (Safari/iOS).
 *
 * Práctica de react.dev (Synchronizing with Effects): el Effect se
 * sincroniza con el sistema externo (hls.js / <video>) y su cleanup
 * destruye la instancia al desmontar o al cambiar `src`, para no dejar
 * players colgados ni fugas de memoria.
 *
 * hls.js se importa dinámicamente: solo se descarga cuando hay un
 * stream que reproducir, no en la carga inicial de la app.
 */
export function useHls(src: string | null, active: boolean): {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: StreamStatus;
} {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<StreamStatus>('idle');
  // App en https y puente en http: el navegador bloquearía la petición
  // (contenido mixto). Se deriva en el render y no se intenta reproducir,
  // así la baldosa dice "Puente sin HTTPS" en vez de "Sin señal".
  const insecure = src !== null && isInsecureBridge(src);

  useEffect(() => {
    const video = videoRef.current;
    if (!active || !src || !video || insecure) {
      setStatus(!src ? 'no-bridge' : 'idle');
      return;
    }

    setStatus('loading');
    let hls: Hls | null = null;
    let cancelled = false;

    function onPlaying() {
      if (!cancelled) setStatus('playing');
    }
    function onVideoError() {
      if (!cancelled) setStatus('error');
    }

    async function setup() {
      if (!video) return;
      // Safari: HLS nativo, sin librería.
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src as string;
        video.addEventListener('playing', onPlaying);
        video.addEventListener('error', onVideoError);
        void video.play().catch(() => undefined);
        return;
      }
      const { default: HlsClass } = await import('hls.js');
      if (cancelled || !video) return;
      if (!HlsClass.isSupported()) {
        setStatus('error');
        return;
      }
      hls = new HlsClass({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });
      hls.loadSource(src as string);
      hls.attachMedia(video);
      hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        void video.play().catch(() => {
          /* Autoplay bloqueado por el navegador: el usuario da play. */
        });
      });
      hls.on(HlsClass.Events.ERROR, (_event, data) => {
        if (data.fatal && !cancelled) setStatus('error');
      });
      video.addEventListener('playing', onPlaying);
    }

    void setup();

    // Cleanup: desconectar y destruir. Sin esto, cada cambio de cámara
    // dejaría un player vivo consumiendo red y memoria.
    return () => {
      cancelled = true;
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onVideoError);
      if (hls) hls.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, active, insecure]);

  return { videoRef, status: insecure ? 'insecure' : status };
}
