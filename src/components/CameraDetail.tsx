import { useCallback, useEffect, useState } from 'react';
import { useDigitalZoom } from '../hooks/useDigitalZoom';
import { ContextMenu, type MenuItem } from './ContextMenu';

const TOUCH_PRIMARY =
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
import type { CameraConfig } from '../lib/types';
import { useHls } from '../hooks/useHls';
import { BLANK_POSTER } from '../lib/poster';
import { maskRtspUrlSafe } from '../lib/rtsp';
import { captureFrame, deliverSnapshot, snapshotName } from '../lib/snapshot';
import type { DvrSettings } from '../lib/types';
import { channelLabel } from '../data/defaultCameras';

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
  const [shotMsg, setShotMsg] = useState<string | null>(null);
  const { containerRef, zoom, zoomed, zoomAtClient, reset, handlers, style } = useDigitalZoom();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const takeSnapshot = useCallback(() => {
    const video = videoRef.current;
    const shot = video ? captureFrame(video) : null;
    if (!shot) {
      setShotMsg('No se pudo tomar la foto: el video aún no carga.');
      return;
    }
    deliverSnapshot(shot, snapshotName(camera.name))
      .then((r) =>
        setShotMsg(
          r === 'downloaded' ? 'Foto descargada.' : r === 'shared' ? 'Foto lista.' : null,
        ),
      )
      .catch(() => setShotMsg('No se pudo guardar la foto. Intenta de nuevo.'));
  }, [camera.name, videoRef]);

  useEffect(() => {
    if (!shotMsg) return;
    const t = setTimeout(() => setShotMsg(null), 4000);
    return () => clearTimeout(t);
  }, [shotMsg]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen();
  }, [containerRef]);

  const menuItems: MenuItem[] = menu
    ? [
        {
          label: zoomed ? '🔍 Acercar más' : '🔍 Zoom digital',
          onSelect: () => zoomAtClient(Math.min(8, zoom.scale * 2), menu.x, menu.y),
          disabled: zoom.scale >= 8,
        },
        { label: '↺ Quitar zoom', onSelect: reset, disabled: !zoomed },
        { label: '📸 Foto del momento', onSelect: takeSnapshot, disabled: status !== 'playing' },
        {
          label: document.fullscreenElement ? '⤢ Salir de pantalla completa' : '⛶ Pantalla completa',
          onSelect: toggleFullscreen,
        },
      ]
    : [];

  return (
    <section className="detail" aria-label={`Vista grande de ${camera.name}`}>
      <div className="detail-header">
        <button type="button" onClick={onClose} aria-label="Volver al mosaico">
          ← Mosaico
        </button>
        <h2>
          {camera.name} <span>· {camera.location} · {channelLabel(camera)}</span>
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

      <div
        ref={containerRef}
        className={`detail-video${zoomed ? ' detail-video--zoomed' : ''}`}
        onContextMenu={(e) => {
          if (!hlsUrl) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('.context-menu')) return;
          // Con zoom: doble clic quita el zoom. Sin zoom (escritorio):
          // regresa al mosaico, saliendo antes de pantalla completa.
          if (zoomed || TOUCH_PRIMARY) {
            reset();
            return;
          }
          if (document.fullscreenElement) void document.exitFullscreen();
          onClose();
        }}
        onPointerDown={(e) => {
          if (!(e.target as HTMLElement).closest('.context-menu')) handlers.onPointerDown(e);
        }}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerCancel}
      >
        {hlsUrl ? (
          <div className="zoom-layer" style={style}>
            {/* crossOrigin: pide el video con CORS (go2rtc trae origin "*") para
                que la "Foto del momento" pueda leer el cuadro. Sin controles
                nativos: chocaban con el zoom; pantalla completa va en el menú. */}
            <video
              ref={videoRef}
              crossOrigin="anonymous"
              muted
              playsInline
              autoPlay
              poster={BLANK_POSTER}
              aria-label={camera.name}
            />
          </div>
        ) : (
          <div className="detail-no-signal">
            <p>Sin puente configurado</p>
            <p>Pon la dirección del puente en Ajustes para ver el video en vivo.</p>
          </div>
        )}
        {zoomed ? (
          <span className="zoom-hint">
            Zoom ×{zoom.scale.toFixed(1)} ·{' '}
            {TOUCH_PRIMARY
              ? 'pellizca para acercar · un dedo mueve · doble toque para salir'
              : 'rueda acerca/aleja · arrastra para mover · doble clic para salir'}
          </span>
        ) : (
          hlsUrl && (
            <span className="zoom-hint zoom-hint--idle">
              {TOUCH_PRIMARY ? 'Pellizca para zoom' : 'Clic derecho: menú · doble clic: mosaico'}
            </span>
          )
        )}
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={closeMenu} />}
        <span className={`tile-status tile-status--${status}`}>
          {status === 'playing'
            ? 'En vivo · principal'
            : status === 'error'
              ? 'Sin señal'
              : status === 'loading'
                ? 'Cargando…'
                : status === 'reconnecting'
                  ? 'Reconectando…'
                : status === 'insecure'
                  ? 'Puente sin HTTPS'
                  : 'Sin puente'}
        </span>
      </div>

      <div className="detail-actions">
        <button type="button" onClick={takeSnapshot} disabled={status !== 'playing'}>
          📸 Foto del momento
        </button>
        {shotMsg && (
          <span className="shot-msg" role="status">
            {shotMsg}
          </span>
        )}
        <code className="rtsp-line">{maskRtspUrlSafe(settings, camera, 0)}</code>
      </div>
    </section>
  );
}
