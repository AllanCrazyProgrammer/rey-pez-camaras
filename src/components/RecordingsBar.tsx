import { useEffect, useRef, useState } from 'react';
import type { CameraConfig } from '../lib/types';
import { fetchTramos, hora12, isoDate, parseHora, toSec, type Tramo } from '../lib/recordings';
import { TimeScrubber } from './TimeScrubber';

interface Props {
  camera: CameraConfig;
  bridgeUrl: string;
  fecha: string;
  /** Segundo del día que se está viendo (null mientras carga). */
  position: number | null;
  /** true mientras el video corre. */
  advancing?: boolean;
  onSeek: (fecha: string, sec: number) => void;
}

const DAY = 86400;

/**
 * Barra de grabaciones: día, saltos de ±1 / ±10 min, resumen de las 24 h
 * (tocarlo brinca a esa hora) y el deslizador fino con lupa.
 */
export function RecordingsBar({ camera, bridgeUrl, fecha, position, advancing, onSeek }: Props) {
  const [tramos, setTramos] = useState<Tramo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);
  // "Ir a una hora": se escribe 5:37 y se elige AM o PM.
  const [goOpen, setGoOpen] = useState(false);
  const [goText, setGoText] = useState('');
  const [goAmpm, setGoAmpm] = useState<'AM' | 'PM'>('AM');
  const [goError, setGoError] = useState<string | null>(null);
  const goInput = useRef<HTMLInputElement | null>(null);
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

  const openGo = () => {
    if (goOpen) return setGoOpen(false);
    // Empieza con la hora que se está viendo, ej. "5:37" + PM.
    const base = position ?? 8 * 3600;
    const [hm, ap] = hora12(base, false).split(' ');
    setGoText(hm);
    setGoAmpm(ap === 'PM' ? 'PM' : 'AM');
    setGoError(null);
    setGoOpen(true);
    requestAnimationFrame(() => goInput.current?.select());
  };

  const submitGo = () => {
    const sec = parseHora(goText, goAmpm);
    if (sec === null) {
      setGoError('Escríbela así: 5:37 (o 5.37) y elige AM o PM.');
      return;
    }
    setGoError(null);
    setGoOpen(false);
    onSeek(fecha, snap(sec));
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
          <button type="button" onClick={() => jump(60)} disabled={position === null}>
            1 min ›
          </button>
          <button type="button" onClick={() => jump(600)} disabled={position === null}>
            10 min »
          </button>
        </div>
        <button
          type="button"
          className={`rec-go-btn${goOpen ? ' rec-go-btn--on' : ''}`}
          aria-expanded={goOpen}
          onClick={openGo}
        >
          🕐 Ir a hora
        </button>
      </div>

      {goOpen && (
        <form
          className="rec-go"
          onSubmit={(e) => {
            e.preventDefault();
            submitGo();
          }}
        >
          <input
            ref={goInput}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="go"
            placeholder="5:37"
            aria-label="Hora, por ejemplo 5:37"
            value={goText}
            onChange={(e) => {
              const v = e.target.value;
              setGoText(v);
              setGoError(null);
              // Si escriben "pm" o "am" en el texto, se marca solo.
              const suf = v.toLowerCase().match(/(a|p)\.?\s*m?\.?\s*$/);
              if (suf) setGoAmpm(suf[1] === 'p' ? 'PM' : 'AM');
            }}
          />
          <div className="rec-go-ampm" role="radiogroup" aria-label="AM o PM">
            {(['AM', 'PM'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={goAmpm === v}
                className={goAmpm === v ? 'is-on' : ''}
                onClick={() => setGoAmpm(v)}
              >
                {v}
              </button>
            ))}
          </div>
          <button type="submit" className="rec-go-submit">
            Ir
          </button>
          {goError && <p className="rec-msg rec-msg--error rec-go-error">{goError}</p>}
        </form>
      )}

      <div
        ref={lineRef}
        className="rec-line rec-line--overview"
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

      <TimeScrubber
        spans={spans}
        position={position}
        advancing={advancing}
        onCommit={(sec) => onSeek(fecha, snap(sec))}
      />

      {error && <p className="rec-msg rec-msg--error">{error}</p>}
      {!error && tramos === null && <p className="rec-msg">Buscando grabaciones…</p>}
      {!error && tramos?.length === 0 && (
        <p className="rec-msg">Esta cámara no tiene grabaciones este día.</p>
      )}
    </div>
  );
}
