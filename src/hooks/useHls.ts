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
    let failures = 0; // fallas seguidas, para espaciar los reintentos
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let lastTime = -1;
    let stalledSince = 0;

    function onPlaying() {
      if (cancelled) return;
      failures = 0;
      setStatus('playing');
    }
    // Respaldo: el WebView de Android a veces no avisa "playing" aunque el
    // video sí avanza. Solo cuenta si ya hay un cuadro de video
    // (readyState ≥ 2): el reloj puede correr aunque no se decodifique.
    let firstTime = -1;
    function onTimeUpdate() {
      if (!video) return;
      if (firstTime < 0) firstTime = video.currentTime;
      else if (video.currentTime > firstTime + 0.5 && video.readyState >= 2) {
        onPlaying();
        video.removeEventListener('timeupdate', onTimeUpdate);
      }
    }
    function onVideoError() {
      if (!cancelled) scheduleRestart();
    }

    /**
     * Reconexión automática. En el teléfono es normal que un stream falle
     * (microcorte del WiFi, el teléfono se queda sin decodificadores un
     * momento): en vez de quedarse en "Sin señal", vuelve a intentar con
     * esperas de 2, 4, 8… hasta 30 s. Tras 3 fallas seguidas muestra
     * "Sin señal", pero sigue intentando.
     */
    function scheduleRestart() {
      if (cancelled || retryTimer) return;
      failures += 1;
      setStatus(failures >= 3 ? 'error' : 'reconnecting');
      const delay = Math.min(30_000, 1000 * 2 ** failures);
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (cancelled) return;
        teardown();
        void setup();
      }, delay);
    }

    function teardown() {
      if (!video) return;
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('error', onVideoError);
      if (hls) hls.destroy();
      hls = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    }

    // Video congelado: si en 15 s no avanza, se reinicia.
    const watchdog = setInterval(() => {
      if (!video || cancelled || retryTimer || video.paused) return;
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        stalledSince = Date.now();
      } else if (stalledSince && Date.now() - stalledSince > 15_000) {
        stalledSince = 0;
        scheduleRestart();
      }
    }, 5000);

    async function setup() {
      if (!video) return;
      firstTime = -1;
      lastTime = -1;
      stalledSince = Date.now();
      video.addEventListener('timeupdate', onTimeUpdate);
      // hls.js primero en todo navegador con MediaSource (Chrome, Firefox,
      // Android, Safari de Mac y iOS 17.1+). Chrome de escritorio ya dice
      // que reproduce HLS nativo (canPlayType = "maybe"), pero no lee los
      // segmentos MPEG-TS de go2rtc (DEMUXER_ERROR_COULD_NOT_PARSE).
      const { default: HlsClass } = await import('hls.js');
      if (cancelled || !video) return;
      if (!HlsClass.isSupported()) {
        // Sin MediaSource (iPhone viejo): HLS nativo del navegador.
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src as string;
          video.addEventListener('playing', onPlaying);
          video.addEventListener('error', onVideoError);
          void video.play().catch(() => undefined);
        } else {
          setStatus('error');
        }
        return;
      }
      const player = new HlsClass({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });
      hls = player;
      let mediaRecoveries = 0;
      player.loadSource(src as string);
      player.attachMedia(video);
      player.on(HlsClass.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        void video.play().catch(() => {
          /* Autoplay bloqueado por el navegador: el usuario da play. */
        });
      });
      player.on(HlsClass.Events.ERROR, (_event, data) => {
        if (!data.fatal || cancelled || player !== hls) return;
        // Error del decodificador: hls.js sabe repararlo sin reconectar.
        if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
          mediaRecoveries += 1;
          player.recoverMediaError();
          return;
        }
        scheduleRestart();
      });
      video.addEventListener('playing', onPlaying);
    }

    void setup();

    // Cleanup: desconectar y destruir. Sin esto, cada cambio de cámara
    // dejaría un player vivo consumiendo red y memoria.
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clearInterval(watchdog);
      teardown();
    };
  }, [src, active, insecure]);

  return { videoRef, status: insecure ? 'insecure' : status };
}
