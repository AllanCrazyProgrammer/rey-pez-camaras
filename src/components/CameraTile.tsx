import { memo, useEffect, useRef, useState } from 'react';
import type { CameraConfig, StreamStatus } from '../lib/types';
import { useHls } from '../hooks/useHls';

const STATUS_LABEL: Record<StreamStatus, string> = {
  idle: 'En pausa',
  'no-bridge': 'Sin puente',
  insecure: 'Puente sin HTTPS',
  loading: 'Cargando…',
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
}

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
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const { videoRef, status } = useHls(hlsUrl, visible);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(camera.name);

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
    <div ref={containerRef} className="tile">
      <button
        type="button"
        className="tile-video-btn"
        onClick={() => onSelect(camera)}
        aria-label={`Ver ${camera.name} en grande`}
      >
        {visible && hlsUrl ? (
          <video ref={videoRef} muted playsInline autoPlay aria-label={camera.name} />
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
