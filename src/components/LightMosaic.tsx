import { useEffect, useMemo, useRef } from 'react';
import type { CameraConfig, DvrKind, StreamStatus } from '../lib/types';
import { useHls } from '../hooks/useHls';
import { MOSAIC_CHANNELS, MOSAIC_COLS } from '../data/mosaicLayout';

const STATUS_LABEL: Partial<Record<StreamStatus, string>> = {
  'no-bridge': 'Sin puente',
  insecure: 'Puente sin HTTPS',
  loading: 'Cargando…',
  reconnecting: 'Reconectando…',
  error: 'Sin señal',
};

/** Tamaño de cada cuadro dentro del video de la Mac mini (1920x1080 / 4). */
const CELL_W = 480;
const CELL_H = 270;

interface Props {
  dvr: DvrKind;
  /** Todas las cámaras (para poner el nombre de cada cuadro). */
  cameras: CameraConfig[];
  /** URL HLS del mosaico de este DVR, o null si no hay puente. */
  hlsUrl: string | null;
  gridCols: 2 | 3 | 4;
  onColsChange: (cols: 2 | 3 | 4) => void;
  onSelect: (camera: CameraConfig) => void;
}

/**
 * Vista ligera: un solo video con todas las cámaras del DVR, armado en
 * la Mac mini. Gasta menos datos y batería que abrir un video por cámara.
 * Cada cámara se recorta de ese video y se dibuja en su propio cuadro
 * (canvas), así se pueden acomodar de 2, 3 o 4 por fila sin abrir más
 * videos. Al tocar un cuadro se abre esa cámara en grande.
 */
export function LightMosaic({ dvr, cameras, hlsUrl, gridCols, onColsChange, onSelect }: Props) {
  const { videoRef, status } = useHls(hlsUrl, true);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  const cells = useMemo(
    () =>
      MOSAIC_CHANNELS[dvr].map((channel) => ({
        channel,
        camera: cameras.find((c) => c.dvr === dvr && c.channel === channel) ?? null,
      })),
    [cameras, dvr],
  );

  // Copia cada cuadro del video a su canvas en cuanto llega un cuadro nuevo.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let handle = 0;
    const hasVfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

    const draw = () => {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth) {
        // Por si el video no llega exactamente a 1920x1080.
        const sw = video.videoWidth / MOSAIC_COLS;
        const sh = video.videoHeight / MOSAIC_COLS;
        canvasRefs.current.forEach((canvas, i) => {
          const ctx = canvas?.getContext('2d');
          if (!ctx) return;
          const col = i % MOSAIC_COLS;
          const row = Math.floor(i / MOSAIC_COLS);
          ctx.drawImage(video, col * sw, row * sh, sw, sh, 0, 0, CELL_W, CELL_H);
        });
      }
      handle = hasVfc ? video.requestVideoFrameCallback(draw) : requestAnimationFrame(draw);
    };
    draw();
    return () => {
      stopped = true;
      if (hasVfc) video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
    };
  }, [videoRef, dvr]);

  const label = STATUS_LABEL[status];

  return (
    <section aria-label="Mosaico ligero">
      <div className="grid-toolbar">
        <span>
          Un solo video con {cells.length} cámaras · toca una para verla en grande
          {label && (
            <span className={`light-status tile-status--${status}`}>{label}</span>
          )}
        </span>
        <div className="grid-cols" role="group" aria-label="Columnas del mosaico">
          {([2, 3, 4] as const).map((cols) => (
            <button
              key={cols}
              type="button"
              aria-pressed={gridCols === cols}
              onClick={() => onColsChange(cols)}
            >
              {cols}×{cols}
            </button>
          ))}
        </div>
      </div>
      {/* El video de origen no se ve, pero debe quedar "en pantalla": si
          se oculta del todo, algunos navegadores (Safari) lo pausan. */}
      <video ref={videoRef} className="light-source" muted playsInline autoPlay aria-hidden="true" />
      <div className="light-grid" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
        {cells.map(({ channel, camera }, i) => (
          <button
            key={channel}
            type="button"
            className="light-tile"
            disabled={!camera}
            onClick={() => camera && onSelect(camera)}
            title={camera ? `Ver ${camera.name} en grande` : undefined}
          >
            <canvas
              ref={(el) => {
                canvasRefs.current[i] = el;
              }}
              width={CELL_W}
              height={CELL_H}
            />
            <span className="light-tile-name">{camera?.name ?? `Canal ${channel}`}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
