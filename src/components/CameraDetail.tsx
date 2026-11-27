import { useCallback, useEffect, useRef, useState } from 'react';
import { useDigitalZoom } from '../hooks/useDigitalZoom';
import { ContextMenu, type MenuItem } from './ContextMenu';

const TOUCH_PRIMARY =
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
import type { CameraConfig } from '../lib/types';
import { useHls } from '../hooks/useHls';
import { BLANK_POSTER } from '../lib/poster';
import { buildHlsUrl, maskRtspUrlSafe } from '../lib/rtsp';
import { isoDate, startPlayback } from '../lib/recordings';
import { RecordingsBar } from './RecordingsBar';
import { APK_SIN_PLUGINS, captureFrame, deliverSnapshot, snapshotName } from '../lib/snapshot';
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
  // Grabaciones: null = en vivo. Si no, qué día/hora se pidió y qué stream
  // de go2rtc (grab1…grab4) la está reproduciendo.
  const [rec, setRec] = useState<{
    fecha: string;
    startSec: number;
    stream: string | null;
    nonce: number;
  } | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const recBase = useRef<number | null>(null);

  const playUrl = rec
    ? rec.stream
      ? `${buildHlsUrl(settings.bridgeUrl, rec.stream)}&n=${rec.nonce}`
      : null
    : hlsUrl;
  const { videoRef, status } = useHls(playUrl, true);

  const seek = useCallback(
    (fecha: string, sec: number) => {
      const prev = rec?.stream ?? undefined;
      setRec({ fecha, startSec: sec, stream: null, nonce: Date.now() });
      setPosition(sec);
      setRecError(null);
      startPlayback(settings.bridgeUrl, camera, fecha, sec, prev)
        .then(({ stream }) =>
          setRec((r) => (r && r.fecha === fecha && r.startSec === sec ? { ...r, stream } : r)),
        )
        .catch((e: Error) => setRecError(e.message));
    },
    [camera, rec?.stream, settings.bridgeUrl],
  );

  const openRecordings = useCallback(() => {
    // Por default: hoy, 10 minutos antes de ahora.
    const now = new Date();
    const sec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    seek(isoDate(now), Math.max(0, sec - 600));
  }, [seek]);

  // Hora que se está viendo = hora pedida + lo que lleva reproduciendo.
  useEffect(() => {
    recBase.current = null;
    if (!rec?.stream) return;
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      if (video.readyState < 2) return;
      if (recBase.current === null) recBase.current = video.currentTime;
      setPosition(Math.min(86399, rec.startSec + (video.currentTime - recBase.current)));
    };
    video.addEventListener('timeupdate', onTime);
    return () => video.removeEventListener('timeupdate', onTime);
  }, [rec?.stream, rec?.nonce, rec?.startSec, videoRef]);
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
      .catch((err: unknown) => {
        const msg = String((err as Error)?.message ?? err);
        setShotMsg(
          msg === APK_SIN_PLUGINS
            ? 'Para guardar fotos instala la APK nueva.'
            : `No se pudo guardar la foto (${msg.slice(0, 80)}).`,
        );
      });
  }, [camera.name, videoRef]);

  useEffect(() => {
    if (!shotMsg) return;
    const t = setTimeout(() => setShotMsg(null), shotMsg.startsWith('Foto') ? 4000 : 12000);
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
          // regresa al mosaico.
          if (zoomed || TOUCH_PRIMARY) {
            reset();
            return;
          }
          // Si la pantalla completa es solo de esta cámara, se sale; si es la
          // del mosaico, se queda para regresar al mosaico en pantalla completa.
          if (document.fullscreenElement === containerRef.current) void document.exitFullscreen();
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
          {rec && status === 'playing'
            ? `Grabación · ${rec.fecha === isoDate(new Date()) ? 'hoy' : rec.fecha}`
            : rec && !rec.stream && !recError
              ? 'Buscando…'
            : status === 'playing'
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

      {rec && (
        <RecordingsBar
          camera={camera}
          bridgeUrl={settings.bridgeUrl}
          fecha={rec.fecha}
          position={rec.stream && status === 'playing' ? position : null}
          onSeek={seek}
        />
      )}
      {recError && <p className="rec-msg rec-msg--error">{recError}</p>}

      <div className="detail-actions">
        {rec ? (
          <button
            type="button"
            className="rec-live-btn"
            onClick={() => {
              setRec(null);
              setRecError(null);
            }}
          >
            ● Volver a en vivo
          </button>
        ) : (
          <button type="button" onClick={openRecordings} disabled={!hlsUrl}>
            🎞 Grabaciones
          </button>
        )}
        <button type="button" onClick={takeSnapshot} disabled={status !== 'playing'}>
          📸 Foto del momento
        </button>
        {shotMsg && (
          <span
            className={`shot-msg${/^(No se pudo|Para guardar)/.test(shotMsg) ? ' shot-msg--error' : ''}`}
            role="status"
          >
            {shotMsg}
          </span>
        )}
        <code className="rtsp-line">{maskRtspUrlSafe(settings, camera, 0)}</code>
      </div>
    </section>
  );
}
