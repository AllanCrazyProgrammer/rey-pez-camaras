import { useEffect, useRef, useState } from 'react';
import type { CameraConfig } from '../lib/types';
import { fetchTramos, hora12, isoDate, toSec, type Tramo } from '../lib/recordings';

interface Props {
  camera: CameraConfig;
  bridgeUrl: string;
  fecha: string;
  /** Segundo del día que se está viendo (null mientras carga). */
  position: number | null;
  onSeek: (fecha: string, sec: number) => void;
}

const DAY = 86400;

/**
 * Barra de grabaciones: día, línea de 24 h con lo grabado y saltos de
 * ±1 / ±10 min. Tocar la línea brinca a esa hora.
 */
export function RecordingsBar({ camera, bridgeUrl, fecha, position, onSeek }: Props) {
  const [tramos, setTramos] = useState<Tramo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);
  const today = isoDate(new Date());
  // Solo DVR y canal: renombrar la cámara no debe volver a buscar.
  const { dvr, channel } = camera;

  useEffect(() => {
    let cancelled = false;
    setTramos(null);
    setError(null);
    fetchTramos(bridgeUrl, { dvr, channel } as CameraConfig, fecha)
      .then((r) => !cancelled && setTramos(r.tramos))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [bridgeUrl, dvr, channel, fecha]);

  const spans = (tramos ?? []).map((t) => [toSec(t.inicio), toSec(t.fin)] as const);

  /** Si la hora cae en un hueco sin grabación, brinca al siguiente tramo. */
  const snap = (sec: number) => {
    if (!spans.length) return sec;
    if (spans.some(([a, b]) => sec >= a && sec < b)) return sec;
    const next = spans.find(([a]) => a > sec);
    if (next) return next[0];
    const [, lastEnd] = spans[spans.length - 1];
    return Math.max(spans[spans.length - 1][0], lastEnd - 60);
  };

  const secAt = (clientX: number) => {
    const r = lineRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.min(DAY - 1, Math.max(0, ((clientX - r.left) / r.width) * DAY));
  };

  const jump = (delta: number) => {
    if (position === null) return;
    onSeek(fecha, snap(Math.min(DAY - 1, Math.max(0, position + delta))));
  };

  return (
    <div className="rec-bar">
      <div className="rec-controls">
        <input
          id="rec-fecha"
          type="date"
          value={fecha}
          max={today}
          aria-label="Día de la grabación"
          onChange={(e) => {
            if (!e.target.value) return;
            // Otro día: empieza a las 8:00 (o donde haya grabación).
            onSeek(e.target.value, 8 * 3600);
          }}
        />
        <div className="rec-jumps" role="group" aria-label="Saltar en la grabación">
          <button type="button" onClick={() => jump(-600)} disabled={position === null}>
            « 10 min
          </button>
          <button type="button" onClick={() => jump(-60)} disabled={position === null}>
            ‹ 1 min
          </button>
          <span className="rec-time" aria-live="polite">
            {position === null ? '--:--:--' : hora12(position)}
          </span>
          <button type="button" onClick={() => jump(60)} disabled={position === null}>
            1 min ›
          </button>
          <button type="button" onClick={() => jump(600)} disabled={position === null}>
            10 min »
          </button>
        </div>
      </div>

      <div
        ref={lineRef}
        className="rec-line"
        role="slider"
        tabIndex={0}
        aria-label="Hora de la grabación"
        aria-valuemin={0}
        aria-valuemax={DAY}
        aria-valuenow={position ?? 0}
        aria-valuetext={position === null ? 'cargando' : hora12(position)}
        onClick={(e) => onSeek(fecha, snap(secAt(e.clientX)))}
        onMouseMove={(e) => setHover(secAt(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') jump(-60);
          if (e.key === 'ArrowRight') jump(60);
        }}
      >
        {spans.map(([a, b]) => (
          <span
            key={a}
            className="rec-span"
            style={{ left: `${(a / DAY) * 100}%`, width: `${((b - a) / DAY) * 100}%` }}
          />
        ))}
        {position !== null && (
          <span className="rec-cursor" style={{ left: `${(position / DAY) * 100}%` }} />
        )}
        {hover !== null && (
          <span className="rec-hover" style={{ left: `${(hover / DAY) * 100}%` }}>
            {hora12(hover, false)}
          </span>
        )}
      </div>
      <div className="rec-hours" aria-hidden="true">
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {h % 12 === 0 ? 12 : h % 12}
            <small>{h < 12 || h === 24 ? 'am' : 'pm'}</small>
          </span>
        ))}
      </div>

      {error && <p className="rec-msg rec-msg--error">{error}</p>}
      {!error && tramos === null && <p className="rec-msg">Buscando grabaciones…</p>}
      {!error && tramos?.length === 0 && (
        <p className="rec-msg">Esta cámara no tiene grabaciones este día.</p>
      )}
    </div>
  );
}
