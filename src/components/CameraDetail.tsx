import { useCallback, useRef } from 'react';
import type { CameraConfig } from '../lib/types';
import { useHls } from '../hooks/useHls';
import { maskRtspUrlSafe } from '../lib/rtsp';
import type { DvrSettings } from '../lib/types';

interface Props {
  camera: CameraConfig;
  settings: DvrSettings;
  hlsUrl: string | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

/** Vista grande de una cámara: stream principal (subtype=0) + foto del momento. */
export function CameraDetail({ camera, settings, hlsUrl, onClose, onPrev, onNext }: Props) {
  const { videoRef, status } = useHls(hlsUrl, true);
  const snapshotRef = useRef<HTMLAnchorElement | null>(null);

  const takeSnapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const link = snapshotRef.current;
    if (!link) return;
    link.href = canvas.toDataURL('image/png');
    link.download = `${camera.name.replace(/\s+/g, '-')}-canal-${camera.channel}.png`;
    link.click();
  }, [camera.channel, camera.name, videoRef]);

  return (
    <section className="detail" aria-label={`Vista grande de ${camera.name}`}>
      <div className="detail-header">
        <button type="button" onClick={onClose} aria-label="Volver al mosaico">
          ← Mosaico
        </button>
        <h2>
          {camera.name} <span>· {camera.location} · Canal {camera.channel}</span>
        </h2>
        <div className="detail-nav">
          <button type="button" onClick={onPrev} aria-label="Cámara anterior">
            ‹ Anterior
          </button>
          <button type="button" onClick={onNext} aria-label="Cámara siguiente">
            Siguiente ›
          </button>
        </div>
      </div>

      <div className="detail-video">
        {hlsUrl ? (
          // crossOrigin: pide el video con CORS (go2rtc trae origin "*") para
          // que la "Foto del momento" pueda leer el cuadro. Sin esto, con HLS
          // nativo (Safari, Chrome nuevo) el canvas queda bloqueado.
          <video
            ref={videoRef}
            crossOrigin="anonymous"
            muted
            playsInline
            autoPlay
            controls
            aria-label={camera.name}
          />
        ) : (
          <div className="detail-no-signal">
            <p>Sin puente configurado</p>
            <p>Pon la dirección del puente en Ajustes para ver el video en vivo.</p>
          </div>
        )}
        <span className={`tile-status tile-status--${status}`}>
          {status === 'playing'
            ? 'En vivo · principal'
            : status === 'error'
              ? 'Sin señal'
              : status === 'loading'
                ? 'Cargando…'
                : status === 'insecure'
                  ? 'Puente sin HTTPS'
                  : 'Sin puente'}
        </span>
      </div>

      <div className="detail-actions">
        <button type="button" onClick={takeSnapshot} disabled={status !== 'playing'}>
          📸 Foto del momento
        </button>
        <a ref={snapshotRef} href="#snapshot" className="hidden" aria-hidden="true" tabIndex={-1}>
          descarga
        </a>
        <code className="rtsp-line">{maskRtspUrlSafe(settings, camera.channel, 0)}</code>
      </div>
    </section>
  );
}
