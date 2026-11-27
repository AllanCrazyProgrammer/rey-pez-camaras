import { useCallback, useEffect, useRef, useState } from 'react';
import { useDigitalZoom } from '../hooks/useDigitalZoom';
import { ContextMenu, type MenuItem } from './ContextMenu';

const TOUCH_PRIMARY =
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
import type { CameraConfig } from '../lib/types';
import { useHls } from '../hooks/useHls';
import { BLANK_POSTER } from '../lib/poster';
import { buildHlsUrl } from '../lib/rtsp';
import { isoDate, startPlayback } from '../lib/recordings';
import { CLIP_FOLDER, recordingSupported, saveClip, startClip, type ClipRecorder } from '../lib/clipRecorder';
import { RecordingsBar } from './RecordingsBar';
import { canShareWhatsApp, GALLERY_FOLDER, shareWhatsApp, type SavedMedia } from '../lib/gallery';
import { horaLupa } from './TimeScrubber';
import { APK_SIN_PLUGINS, captureFrame, deliverSnapshot, snapshotName } from '../lib/snapshot';
import type { DvrSettings } from '../lib/types';
import { channelLabel } from '../data/defaultCameras';

/** Cuadro actual del video en chico (para dejarlo en pantalla mientras salta). */
function grabFrame(video: HTMLVideoElement | null): string | null {
  if (!video || video.readyState < 2 || !video.videoWidth) return null;
  try {
    const w = Math.min(960, video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * w);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return null;
  }
}

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

  // Pausa: se guarda el último cuadro (para dejarlo en pantalla) y en qué
  // hora iba la grabación; el video se desconecta mientras tanto.
  const [paused, setPaused] = useState<{ frame: string | null; pos: number | null } | null>(null);
  // Clip que se está grabando para guardar en el aparato.
  const [clip, setClip] = useState<{ rec: ClipRecorder; started: number; name: string } | null>(null);
  const clipRef = useRef(clip);
  clipRef.current = clip;
  const [, setTick] = useState(0);
  // Transición al saltar de hora: el último cuadro se queda (desenfocado) con
  // la hora a la que se va, y se desvanece cuando llega el video nuevo.
  const [seekFx, setSeekFx] = useState<{
    frame: string | null;
    dir: -1 | 0 | 1;
    label: string;
    out: boolean;
  } | null>(null);
  const seekFxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playUrl = paused
    ? null
    : rec
    ? rec.stream
      ? `${buildHlsUrl(settings.bridgeUrl, rec.stream)}&n=${rec.nonce}`
      : null
    : hlsUrl;
  const { videoRef, status } = useHls(playUrl, true);

  const seek = useCallback(
    (fecha: string, sec: number) => {
      const prev = rec?.stream ?? undefined;
      const from = paused?.pos ?? position;
      const frame = paused?.frame ?? grabFrame(videoRef.current);
      if (seekFxTimer.current) clearTimeout(seekFxTimer.current);
      setSeekFx((f) => ({
        // Si ya estaba saltando (video sin imagen), se queda el cuadro anterior.
        frame: frame ?? f?.frame ?? null,
        dir: !rec || from === null || rec.fecha !== fecha ? 0 : sec < from ? -1 : sec > from ? 1 : 0,
        label: horaLupa(sec),
        out: false,
      }));
      setRec({ fecha, startSec: sec, stream: null, nonce: Date.now() });
      if (paused) {
        setPaused(null);
        clipRef.current?.rec.resume();
      }
      setPosition(sec);
      setRecError(null);
      startPlayback(settings.bridgeUrl, camera, fecha, sec, prev)
        .then(({ stream }) =>
          setRec((r) => (r && r.fecha === fecha && r.startSec === sec ? { ...r, stream } : r)),
        )
        .catch((e: Error) => setRecError(e.message));
    },
    [camera, paused, position, rec, settings.bridgeUrl, videoRef],
  );

  const togglePause = () => {
    if (paused) {
      const p = paused;
      if (rec && p.pos !== null) {
        seek(rec.fecha, p.pos); // sigue donde se quedó
      } else {
        setPaused(null);
        clipRef.current?.rec.resume();
      }
      return;
    }
    const video = videoRef.current;
    const frame = video ? (captureFrame(video)?.dataUrl ?? null) : null;
    setPaused({ frame, pos: rec ? position : null });
    clip?.rec.pause();
  };

  const startRecording = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    try {
      const name = snapshotName(rec ? `${camera.name} grabacion` : camera.name).replace(/\.jpg$/, '');
      setClip({ rec: startClip(video), started: Date.now(), name });
      setShotMsg(null);
    } catch (e) {
      setShotMsg(`No se pudo grabar (${(e as Error).message}).`);
    }
  };

  const finishClip = useCallback(async (c: { rec: ClipRecorder; name: string }) => {
    setShotMsg('Guardando clip…');
    setSaved(null);
    try {
      const { blob, ext } = await c.rec.stop();
      const name = `${c.name}.${ext}`;
      const { result, uri } = await saveClip(blob, name);
      setShotMsg(
        result === 'gallery'
          ? `Clip guardado en la galería (${GALLERY_FOLDER}).`
          : result === 'saved'
          ? `Clip guardado en Documentos/${CLIP_FOLDER}.`
          : result === 'downloaded'
            ? 'Clip descargado.'
            : result === 'shared'
              ? 'Clip listo.'
              : null,
      );
      if (result === 'gallery' || result === 'saved' || result === 'downloaded') {
        setSaved({ kind: 'clip', name, blob, uri });
      }
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      setShotMsg(
        msg === 'APK_SIN_PLUGINS'
          ? 'Para guardar clips instala la APK nueva.'
          : `No se pudo guardar el clip (${msg.slice(0, 80)}).`,
      );
    }
  }, []);

  const stopRecording = () => {
    if (!clip) return;
    setClip(null);
    void finishClip(clip);
  };

  // Contador del clip, y si se cierra la cámara a medio grabar, se guarda lo grabado.
  useEffect(() => {
    if (!clip) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [clip]);
  useEffect(
    () => () => {
      if (clipRef.current) void finishClip(clipRef.current);
    },
    [finishClip],
  );
  const clipSecs = clip ? Math.floor((Date.now() - clip.started) / 1000) : 0;
  const clipTime = `${Math.floor(clipSecs / 60)}:${String(clipSecs % 60).padStart(2, '0')}`;

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
      if (recBase.current === null) {
        // El inicio de lo recibido es la hora pedida (el reproductor puede
        // arrancar un poco más adelante para ir casi en tiempo real).
        recBase.current =
          video.buffered.length && video.buffered.start(0) <= video.currentTime
            ? video.buffered.start(0)
            : video.currentTime;
        // Ya hay imagen nueva: se desvanece el cuadro anterior.
        setSeekFx((f) => (f ? { ...f, out: true } : f));
        if (seekFxTimer.current) clearTimeout(seekFxTimer.current);
        seekFxTimer.current = setTimeout(() => setSeekFx(null), 450);
      }
      setPosition(Math.min(86399, rec.startSec + (video.currentTime - recBase.current)));
    };
    video.addEventListener('timeupdate', onTime);
    return () => video.removeEventListener('timeupdate', onTime);
  }, [rec?.stream, rec?.nonce, rec?.startSec, videoRef]);

  // Sin grabación o con error, no se queda el cuadro congelado.
  useEffect(() => {
    if (!rec || recError) setSeekFx(null);
  }, [rec, recError]);
  useEffect(() => () => {
    if (seekFxTimer.current) clearTimeout(seekFxTimer.current);
  }, []);
  const [shotMsg, setShotMsg] = useState<string | null>(null);
  // Última foto o clip guardado, para "Compartir por WhatsApp".
  const [saved, setSaved] = useState<SavedMedia | null>(null);
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
    const name = snapshotName(camera.name);
    setSaved(null);
    deliverSnapshot(shot, name)
      .then(({ result, uri }) => {
        setShotMsg(
          result === 'gallery'
            ? `Foto guardada en la galería (${GALLERY_FOLDER}).`
            : result === 'downloaded'
              ? 'Foto descargada.'
              : result === 'shared'
                ? 'Foto lista.'
                : null,
        );
        if (result === 'gallery' || result === 'downloaded') {
          setSaved({ kind: 'foto', name, blob: shot.blob, uri });
        }
      })
      .catch((err: unknown) => {
        const msg = String((err as Error)?.message ?? err);
        setShotMsg(
          msg === APK_SIN_PLUGINS
            ? 'Para guardar fotos instala la APK nueva.'
            : `No se pudo guardar la foto (${msg.slice(0, 80)}).`,
        );
      });
  }, [camera.name, videoRef]);

  const shareable = saved && canShareWhatsApp(saved) ? saved : null;
  useEffect(() => {
    if (!shotMsg) return;
    if (shotMsg === 'Guardando clip…') return;
    // Con botón de WhatsApp se deja más tiempo para alcanzar a tocarlo.
    const ms = shareable ? 60000 : shotMsg.startsWith('Foto') ? 4000 : 12000;
    const t = setTimeout(() => {
      setShotMsg(null);
      setSaved(null);
    }, ms);
    return () => clearTimeout(t);
  }, [shotMsg, shareable]);

  const sendWhatsApp = () => {
    if (!shareable) return;
    shareWhatsApp(shareable).catch((e: Error) =>
      setShotMsg(`No se pudo abrir WhatsApp (${String(e?.message ?? e).slice(0, 80)}).`),
    );
  };

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
            {paused?.frame && <img className="pause-frame" src={paused.frame} alt="" />}
            {seekFx && !paused && (
              <div
                className={`seek-fx seek-fx--${seekFx.dir < 0 ? 'back' : seekFx.dir > 0 ? 'fwd' : 'none'}${seekFx.out ? ' seek-fx--out' : ''}`}
                aria-hidden="true"
              >
                {seekFx.frame && <img src={seekFx.frame} alt="" />}
              </div>
            )}
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
        {clip && <span className="clip-badge">● REC {clipTime}</span>}
        {seekFx && !paused && !seekFx.out && (
          <span className="seek-chip" role="status">
            {seekFx.dir < 0 ? '⏪' : seekFx.dir > 0 ? '⏩' : '⏱'} {seekFx.label}
          </span>
        )}
        <span className={`tile-status tile-status--${paused ? 'idle' : status}`}>
          {paused
            ? 'En pausa'
            : rec && status === 'playing'
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
          position={paused ? paused.pos : rec.stream && status === 'playing' ? position : rec.startSec}
          advancing={!paused && !!rec.stream && status === 'playing'}
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
              if (paused) {
                setPaused(null);
                clip?.rec.resume();
              }
            }}
          >
            ● Volver a en vivo
          </button>
        ) : (
          <button type="button" onClick={openRecordings} disabled={!hlsUrl}>
            🎞 Grabaciones
          </button>
        )}
        <button
          type="button"
          onClick={togglePause}
          disabled={!paused && status !== 'playing'}
        >
          {paused ? '▶ Reanudar' : '⏸ Pausar'}
        </button>
        {clip ? (
          <button type="button" className="clip-stop-btn" onClick={stopRecording}>
            ⏹ Detener clip · {clipTime}
          </button>
        ) : (
          recordingSupported() && (
            <button type="button" onClick={startRecording} disabled={status !== 'playing'}>
              ⏺ Grabar clip
            </button>
          )
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
        {shareable && (
          <span className="share-row">
            <button type="button" className="wa-btn" onClick={sendWhatsApp}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z"
                />
              </svg>
              Compartir {shareable.kind === 'clip' ? 'clip' : 'foto'} por WhatsApp
            </button>
            <button
              type="button"
              className="share-close"
              aria-label="Cerrar"
              onClick={() => {
                setSaved(null);
                setShotMsg(null);
              }}
            >
              ✕
            </button>
          </span>
        )}
      </div>
    </section>
  );
}
