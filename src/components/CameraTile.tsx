import { memo, useEffect, useRef, useState } from 'react';
import type { CameraConfig, StreamStatus } from '../lib/types';
import { useHls } from '../hooks/useHls';
import { BLANK_POSTER } from '../lib/poster';

const STATUS_LABEL: Record<StreamStatus, string> = {
  idle: 'En pausa',
  'no-bridge': 'Sin puente',
  insecure: 'Puente sin HTTPS',
  loading: 'Cargando…',
  reconnecting: 'Reconectando…',
  playing: 'En vivo',
  error: 'Sin señal',
};

interface Props {
  camera: CameraConfig;
  /** URL HLS del substream (mosaico) o null si no hay puente. */
  hlsUrl: string | null;
  onSelect: (camera: CameraConfig) => void;
  /** Cambia el nombre de la cámara (se comparte vía la Mac mini). */
  onRename: (id: number, name: string) => void;
  /** Soltar otra cámara encima de esta: la movida toma este lugar. */
  onMove: (fromId: number, toId: number) => void;
}

/** Tipo propio en dataTransfer para no confundir con texto o archivos. */
const DRAG_TYPE = 'application/x-rey-pez-camara';

/**
 * En pantallas táctiles el arrastre lo maneja el mosaico con el dedo;
 * el arrastre nativo (iOS lo activa al mantener presionado) chocaría.
 */
const TOUCH_PRIMARY =
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * Una baldosa del mosaico. `memo` evita que se vuelva a renderizar
 * cuando cambia otra cámara: solo re-renderiza si cambian sus props.
 * El player solo se monta cuando la baldosa es visible en pantalla
 * (IntersectionObserver), así 14 cámaras no abren 14 streams a la vez.
 */
export const CameraTile = memo(function CameraTile({
  camera,
  hlsUrl,
  onSelect,
  onRename,
  onMove,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const { videoRef, status } = useHls(hlsUrl, visible);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(camera.name);
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);

  const startEdit = () => {
    setDraft(camera.name);
    setEditing(true);
  };
  const commit = () => {
    const name = draft.trim();
    if (name && name !== camera.name) onRename(camera.id, name);
    setEditing(false);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`tile${dragging ? ' tile--dragging' : ''}${dropTarget ? ' tile--drop' : ''}`}
      data-camera-id={camera.id}
      draggable={!editing && !TOUCH_PRIMARY}
      title="Arrastra para acomodar"
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, String(camera.id));
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!dropTarget) setDropTarget(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropTarget(false);
        const fromId = Number(e.dataTransfer.getData(DRAG_TYPE));
        if (fromId && fromId !== camera.id) onMove(fromId, camera.id);
      }}
    >
      <button
        type="button"
        className="tile-video-btn"
        onClick={() => onSelect(camera)}
        aria-label={`Ver ${camera.name} en grande`}
      >
        {visible && hlsUrl ? (
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            poster={BLANK_POSTER}
            aria-label={camera.name}
          />
        ) : (
          <div className="tile-placeholder" aria-hidden="true">
            <span className="tile-placeholder-icon">📷</span>
          </div>
        )}
        <span className={`tile-status tile-status--${status}`}>
          {STATUS_LABEL[status]}
        </span>
      </button>
      <div className="tile-info">
        {editing ? (
          <input
            className="tile-name-input"
            value={draft}
            maxLength={60}
            autoFocus
            aria-label={`Nombre de la cámara ${camera.channel}`}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <div className="tile-name">
            <strong>{camera.name}</strong>
            <button
              type="button"
              className="tile-rename"
              onClick={startEdit}
              aria-label={`Cambiar nombre de ${camera.name}`}
              title="Cambiar nombre"
            >
              ✎
            </button>
          </div>
        )}
        <span>
          {camera.location} · Canal {camera.channel}
        </span>
      </div>
    </div>
  );
});
