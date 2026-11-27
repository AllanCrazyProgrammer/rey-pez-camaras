import { useEffect, useMemo, useRef } from 'react';
import type { CameraConfig, DvrKind, StreamStatus } from '../lib/types';
import { useHls } from '../hooks/useHls';
import { useTouchReorder } from '../hooks/useTouchReorder';
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
  /** Columnas (2-4 elegidas por Allan; en pantalla completa se calculan). */
  gridCols: number;
  onColsChange: (cols: 2 | 3 | 4) => void;
  onSelect: (camera: CameraConfig) => void;
  /** Soltar una cámara sobre otra: la movida toma ese lugar (mismo orden que el modo normal). */
  onMove: (fromId: number, toId: number) => void;
}

/** Tipo propio en dataTransfer, igual que en el modo normal. */
const DRAG_TYPE = 'application/x-rey-pez-camara';
const TOUCH_PRIMARY =
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * Vista ligera: un solo video con todas las cámaras del DVR, armado en
 * la Mac mini. Gasta menos datos y batería que abrir un video por cámara.
 * Cada cámara se recorta de ese video y se dibuja en su propio cuadro
 * (canvas), así se pueden acomodar de 2, 3 o 4 por fila sin abrir más
 * videos. Al tocar un cuadro se abre esa cámara en grande.
 */
export function LightMosaic({
  dvr,
  cameras,
  hlsUrl,
  gridCols,
  onColsChange,
  onSelect,
  onMove,
}: Props) {
  const { videoRef, status } = useHls(hlsUrl, true);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // Mismo orden que el modo normal (el que acomoda Allan arrastrando).
  // `src` = posición de la cámara dentro del video de la Mac mini.
  const cells = useMemo(
    () =>
      cameras
        .filter((c) => c.dvr === dvr && c.enabled && MOSAIC_CHANNELS[dvr].includes(c.channel))
        .map((camera) => ({ camera, src: MOSAIC_CHANNELS[dvr].indexOf(camera.channel) })),
    [cameras, dvr],
  );
  const gridRef = useTouchReorder(onMove, '.light-tile[data-camera-id]', cells.length > 0);

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
          // i = posición en el video de la Mac mini, no en pantalla.
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
          {cells.length} cámaras · un solo video
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
      <div
        ref={gridRef}
        className="light-grid"
        style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}
      >
        {cells.map(({ camera, src }) => (
          <div
            key={camera.id}
            className="light-tile"
            data-camera-id={camera.id}
            draggable={!TOUCH_PRIMARY}
            title="Arrastra para acomodar"
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, String(camera.id));
              e.dataTransfer.effectAllowed = 'move';
              e.currentTarget.classList.add('tile--dragging');
            }}
            onDragEnd={(e) => e.currentTarget.classList.remove('tile--dragging')}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              e.currentTarget.classList.add('tile--drop');
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                e.currentTarget.classList.remove('tile--drop');
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('tile--drop');
              const fromId = Number(e.dataTransfer.getData(DRAG_TYPE));
              if (fromId && fromId !== camera.id) onMove(fromId, camera.id);
            }}
          >
            <button
              type="button"
              className="light-tile-btn"
              onClick={() => onSelect(camera)}
              aria-label={`Ver ${camera.name} en grande`}
            >
              <canvas
                ref={(el) => {
                  canvasRefs.current[src] = el;
                }}
                width={CELL_W}
                height={CELL_H}
              />
              <span className="light-tile-name">{camera.name}</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
