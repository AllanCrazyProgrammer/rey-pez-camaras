import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Deslizador de grabaciones tipo editor de video.
 * - La línea de tiempo se arrastra (dedo o ratón) con inercia; la aguja y
 *   la lupa se quedan fijas en el centro.
 * - La lupa amplía 8x lo que está bajo la aguja y muestra la hora exacta
 *   (ej. 5:59.34 PM = 5:59 y 34 segundos).
 * - Rueda del ratón / pellizco = acercar o alejar (de 2 min a 24 h en pantalla).
 * - Al soltar (cuando deja de moverse) se pide la grabación de esa hora.
 * Se dibuja en un canvas en cada cuadro para que se mueva fluido. Todo
 * movimiento (arrastre, saltos, zoom, seguir al video) va a un "destino" y lo
 * que se ve se acerca a él con suavidad, así nunca brinca de golpe.
 */

const DAY = 86400;
const MIN_SPAN = 120; // segundos visibles con el máximo acercamiento
const MAX_SPAN = DAY;
const LENS_ZOOM = 8; // dentro de la lupa el tiempo se ve 8 veces más cerca
const H = 118; // alto en px de CSS
const STRIP_TOP = 44;
const STRIP_BOTTOM = H - 18;
const LENS_R = 40;
/** Qué tan rápido alcanza lo que se ve a su destino (ms; menor = más pegado). */
const EASE_DRAG = 28;
const EASE_JUMP = 170;
const EASE_ZOOM = 140;
const TICK_STEPS = [1, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600];

const pad = (n: number) => String(n).padStart(2, '0');

/** "5:59.34 PM": minutos y, después del punto, los segundos. */
export function horaLupa(sec: number): string {
  const s = Math.max(0, Math.min(DAY - 1, Math.floor(sec)));
  const h = Math.floor(s / 3600);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(Math.floor((s % 3600) / 60))}.${pad(s % 60)} ${h < 12 ? 'AM' : 'PM'}`;
}

function tickLabel(sec: number, step: number): string {
  const s = ((Math.round(sec) % DAY) + DAY) % DAY;
  const h = Math.floor(s / 3600);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ap = h < 12 ? 'am' : 'pm';
  if (step < 60) return `${h12}:${pad(Math.floor((s % 3600) / 60))}.${pad(s % 60)}`;
  if (step % 3600 === 0 && s % 3600 === 0) return `${h12} ${ap}`;
  return `${h12}:${pad(Math.floor((s % 3600) / 60))}`;
}

interface Props {
  /** Tramos grabados [inicio, fin] en segundos del día. */
  spans: ReadonlyArray<readonly [number, number]>;
  /** Hora que se está reproduciendo (null = cargando). */
  position: number | null;
  /** true mientras el video corre (la hora avanza sola entre avisos). */
  advancing?: boolean;
  /** Se llama al soltar con la hora elegida. */
  onCommit: (sec: number) => void;
}

export function TimeScrubber({ spans, position, advancing = false, onCommit }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [label, setLabel] = useState(() => horaLupa(position ?? 0));
  const [dragging, setDragging] = useState(false);

  // Estado de la animación en refs (no re-renderiza en cada cuadro).
  const st = useRef({
    center: position ?? 12 * 3600, // lo que se ve
    goal: position ?? 12 * 3600, // a donde va
    ease: EASE_JUMP,
    span: 0, // segundos visibles a lo ancho (se ajusta al ancho al empezar)
    spanGoal: 0,
    vel: 0, // segundos por ms (inercia)
    interacting: false,
    lastMove: 0,
    commitTimer: 0 as ReturnType<typeof setTimeout> | 0,
    pointers: new Map<number, number>(), // id → x
    pinchDist: 0,
    downX: 0,
    moved: false,
    target: position,
    targetAt: 0, // cuándo llegó la hora del video (para adelantarla entre avisos)
    advancing,
    spans,
  });
  st.current.spans = spans;
  st.current.advancing = advancing;
  if (st.current.target !== position) {
    st.current.target = position;
    st.current.targetAt = performance.now();
  }

  const clampCenter = (c: number) => Math.max(0, Math.min(DAY - 1, c));

  const scheduleCommit = useCallback(() => {
    const s = st.current;
    if (s.commitTimer) clearTimeout(s.commitTimer);
    s.commitTimer = setTimeout(() => {
      s.commitTimer = 0;
      if (s.interacting || Math.abs(s.vel) > 0.0005) return scheduleCommit();
      onCommit(Math.floor(s.goal));
      // Se deja de seguir al video unos segundos mientras carga la nueva hora.
      s.lastMove = performance.now();
    }, 450);
  }, [onCommit]);

  // Bucle de dibujo.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const css = getComputedStyle(wrap);
    const col = (v: string, fb: string) => css.getPropertyValue(v).trim() || fb;
    const C = {
      bg: col('--surface-2', '#262622'),
      text: col('--text', '#efe9dc'),
      muted: col('--muted', '#a8a294'),
      border: col('--border', '#3a3a32'),
      accent: col('--accent', '#c85a17'),
      ok: col('--ok', '#4caf7d'),
      bgPage: col('--bg', '#141412'),
    };
    let raf = 0;
    let lastT = performance.now();
    let lastLabel = '';

    const drawStrip = (w: number, center: number, span: number) => {
      const spp = span / w; // segundos por px
      const t0 = center - span / 2;
      const x = (t: number) => (t - t0) / spp;
      // Fondo
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, STRIP_TOP, w, STRIP_BOTTOM - STRIP_TOP);
      // Fuera del día
      ctx.fillStyle = C.bgPage;
      if (t0 < 0) ctx.fillRect(0, STRIP_TOP, x(0), STRIP_BOTTOM - STRIP_TOP);
      if (t0 + span > DAY) ctx.fillRect(x(DAY), STRIP_TOP, w - x(DAY), STRIP_BOTTOM - STRIP_TOP);
      // Lo grabado
      ctx.fillStyle = C.ok;
      ctx.globalAlpha = 0.55;
      for (const [a, b] of st.current.spans) {
        if (b < t0 || a > t0 + span) continue;
        ctx.fillRect(x(a), STRIP_BOTTOM - 22, Math.max(1, x(b) - x(a)), 14);
      }
      ctx.globalAlpha = 1;
      // Marcas
      const minor = TICK_STEPS.find((s) => s / spp >= 7) ?? 21600;
      const major = TICK_STEPS.find((s) => s / spp >= 90 && s % minor === 0) ?? 21600;
      ctx.strokeStyle = C.muted;
      ctx.fillStyle = C.text;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const first = Math.ceil(Math.max(0, t0) / minor) * minor;
      const last = Math.min(DAY, t0 + span);
      ctx.beginPath();
      for (let t = first; t <= last; t += minor) {
        const px = Math.round(x(t)) + 0.5;
        const isMajor = t % major === 0;
        ctx.moveTo(px, STRIP_TOP);
        ctx.lineTo(px, STRIP_TOP + (isMajor ? 14 : 6));
        if (isMajor) ctx.fillText(tickLabel(t, major), px, STRIP_TOP + 27);
      }
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    /** Regla ampliada dentro de la lupa: marcas finas y su hora. */
    const drawLens = (cx: number, cy: number, center: number, spp: number) => {
      const top = cy - LENS_R;
      const x = (t: number) => cx + (t - center) / spp;
      const tFrom = center - LENS_R * spp;
      const tTo = center + LENS_R * spp;
      ctx.fillStyle = C.bgPage;
      ctx.fillRect(cx - LENS_R, top, LENS_R * 2, LENS_R * 2);
      // Lo grabado, como banda ancha abajo
      ctx.fillStyle = C.ok;
      ctx.globalAlpha = 0.6;
      for (const [a, b] of st.current.spans) {
        if (b < tFrom || a > tTo) continue;
        ctx.fillRect(x(a), cy + 10, Math.max(1, x(b) - x(a)), 16);
      }
      ctx.globalAlpha = 1;
      const minor = TICK_STEPS.find((v) => v / spp >= 5) ?? 21600;
      const major = TICK_STEPS.find((v) => v / spp >= 62 && v % minor === 0) ?? 21600;
      ctx.strokeStyle = C.text;
      ctx.fillStyle = C.text;
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.beginPath();
      for (let t = Math.ceil(Math.max(0, tFrom) / minor) * minor; t <= Math.min(DAY, tTo); t += minor) {
        const px = Math.round(x(t)) + 0.5;
        const isMajor = t % major === 0;
        ctx.moveTo(px, top + 4);
        ctx.lineTo(px, top + (isMajor ? 22 : 12));
        if (isMajor) ctx.fillText(tickLabel(t, major), px, cy + 6);
      }
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(64, t - lastT);
      lastT = t;
      const s = st.current;
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.height = `${H}px`;
      }
      // Acercamiento inicial según el ancho: celular ~18 min, computadora ~50 min.
      if (!s.span) s.span = s.spanGoal = Math.max(900, Math.min(3600, Math.round(w * 3)));
      // Inercia (mueve el destino; lo que se ve lo sigue suave).
      if (!s.interacting && Math.abs(s.vel) > 0.00001) {
        s.goal = clampCenter(s.goal + s.vel * dt);
        s.ease = EASE_DRAG;
        s.vel *= Math.pow(0.94, dt / 16);
        if (Math.abs(s.vel) < 0.0004) s.vel = 0;
      }
      // Seguir al video cuando nadie lo toca: la hora avanza sola entre un
      // aviso y otro del video, así la línea corre parejo y no a saltitos.
      if (!s.interacting && !s.vel && !s.commitTimer && s.target !== null && t - s.lastMove > 2500) {
        const ahead = s.advancing ? Math.min(1, Math.max(0, (t - s.targetAt) / 1000)) : 0;
        const want = clampCenter(s.target + ahead);
        if (Math.abs(want - s.goal) > 0.05) {
          // Lejos (otro tramo, otra hora): viaje suave; cerca: ir pegado.
          s.ease = Math.abs(want - s.goal) > 5 ? EASE_JUMP * 1.3 : EASE_JUMP;
          s.goal = want;
        }
      }
      // Acercar lo que se ve a su destino (suavizado exponencial, igual a
      // cualquier velocidad de pantalla).
      const k = 1 - Math.exp(-dt / s.ease);
      const gap = s.goal - s.center;
      s.center = Math.abs(gap) < 0.01 ? s.goal : s.center + gap * k;
      if (s.span !== s.spanGoal) {
        const kz = 1 - Math.exp(-dt / EASE_ZOOM);
        const ls = Math.log(s.span) + (Math.log(s.spanGoal) - Math.log(s.span)) * kz;
        s.span = Math.abs(ls - Math.log(s.spanGoal)) < 0.002 ? s.spanGoal : Math.exp(ls);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, H);
      drawStrip(w, s.center, s.span);

      // Lupa: lo mismo, 4 veces más cerca, dentro de un círculo al centro.
      const cx = w / 2;
      const cy = (STRIP_TOP + STRIP_BOTTOM) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, LENS_R, 0, Math.PI * 2);
      ctx.clip();
      drawLens(cx, cy, s.center, s.span / w / LENS_ZOOM);
      ctx.restore();
      // Brillo de vidrio
      const glass = ctx.createRadialGradient(cx - 16, cy - 18, 2, cx - 8, cy - 8, LENS_R);
      glass.addColorStop(0, 'rgba(255,255,255,0.28)');
      glass.addColorStop(0.45, 'rgba(255,255,255,0.05)');
      glass.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.arc(cx, cy, LENS_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.accent;
      ctx.stroke();
      // Aguja
      ctx.fillStyle = C.accent;
      ctx.fillRect(Math.round(cx) - 1, STRIP_TOP - 6, 2, STRIP_BOTTOM - STRIP_TOP + 12);
      ctx.beginPath();
      ctx.moveTo(cx - 6, STRIP_TOP - 8);
      ctx.lineTo(cx + 6, STRIP_TOP - 8);
      ctx.lineTo(cx, STRIP_TOP - 1);
      ctx.closePath();
      ctx.fill();

      const lbl = horaLupa(s.center);
      if (lbl !== lastLabel) {
        lastLabel = lbl;
        setLabel(lbl);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Arrastre, inercia, pellizco y rueda.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const s = st.current;
    let lastX = 0;
    let lastT = 0;

    const zoomBy = (factor: number) => {
      s.spanGoal = Math.max(MIN_SPAN, Math.min(MAX_SPAN, s.spanGoal * factor));
    };
    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      s.pointers.set(e.pointerId, e.clientX);
      s.interacting = true;
      s.vel = 0;
      // Tomar la línea la detiene donde se ve, sin seguir resbalando.
      s.goal = s.center;
      s.moved = false;
      s.downX = e.clientX;
      lastX = e.clientX;
      lastT = performance.now();
      if (s.pointers.size === 2) {
        const [a, b] = [...s.pointers.values()];
        s.pinchDist = Math.abs(a - b);
      }
      setDragging(true);
    };
    const onMove = (e: PointerEvent) => {
      if (!s.pointers.has(e.pointerId)) return;
      s.pointers.set(e.pointerId, e.clientX);
      const w = el.clientWidth || 1;
      if (s.pointers.size >= 2) {
        const [a, b] = [...s.pointers.values()];
        const d = Math.abs(a - b);
        if (s.pinchDist > 10 && d > 10) zoomBy(s.pinchDist / d);
        s.pinchDist = d;
        s.moved = true;
        return;
      }
      const now = performance.now();
      const dx = e.clientX - lastX;
      if (Math.abs(e.clientX - s.downX) > 4) s.moved = true;
      const dSec = (-dx * s.span) / w;
      s.goal = clampCenter(s.goal + dSec);
      s.ease = EASE_DRAG;
      const dt = Math.max(1, now - lastT);
      // Inercia con tope: un "aventón" recorre como mucho ~1 ancho de pantalla
      // (para no perder la hora que se estaba buscando).
      const vMax = (2.5 * s.span) / w;
      s.vel = Math.max(-vMax, Math.min(vMax, 0.8 * (dSec / dt) + 0.2 * s.vel));
      lastX = e.clientX;
      lastT = now;
      s.lastMove = now;
    };
    const onUp = (e: PointerEvent) => {
      s.pointers.delete(e.pointerId);
      if (s.pointers.size > 0) return;
      s.interacting = false;
      setDragging(false);
      if (performance.now() - lastT > 80) s.vel = 0; // se detuvo antes de soltar
      if (!s.moved) {
        // Toque sin arrastrar: lleva esa hora al centro.
        const r = el.getBoundingClientRect();
        s.goal = clampCenter(s.goal + ((e.clientX - r.left - r.width / 2) * s.span) / r.width);
        s.ease = EASE_JUMP;
        s.vel = 0;
      }
      s.lastMove = performance.now();
      scheduleCommit();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        zoomBy(Math.exp(e.deltaY * 0.002)); // rueda = acercar/alejar
      } else {
        s.goal = clampCenter(s.goal + (e.deltaX * s.span) / (el.clientWidth || 1));
        s.ease = EASE_DRAG * 2;
        s.lastMove = performance.now();
        scheduleCommit();
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [scheduleCommit]);

  useEffect(() => () => {
    if (st.current.commitTimer) clearTimeout(st.current.commitTimer);
  }, []);

  const setSpan = (span: number) => {
    st.current.spanGoal = span;
  };
  const nudge = (sec: number) => {
    const s = st.current;
    s.vel = 0;
    s.goal = clampCenter(s.goal + sec);
    s.ease = EASE_JUMP;
    s.lastMove = performance.now();
    scheduleCommit();
  };

  return (
    <div className="scrubber">
      <div
        ref={wrapRef}
        className={`scrubber-track${dragging ? ' scrubber-track--drag' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label="Hora de la grabación: arrastra para elegir"
        aria-valuemin={0}
        aria-valuemax={DAY}
        aria-valuenow={Math.floor(st.current.goal)}
        aria-valuetext={label}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 60 : 10;
          if (e.key === 'ArrowLeft') nudge(-step);
          if (e.key === 'ArrowRight') nudge(step);
        }}
      >
        <canvas ref={canvasRef} />
        <span className="scrubber-lupa" aria-hidden="true">
          {label}
        </span>
      </div>
      <div className="scrubber-zoom" role="group" aria-label="Acercar la línea de tiempo">
        {(
          [
            [600, '10 min'],
            [3600, '1 h'],
            [6 * 3600, '6 h'],
            [DAY, 'Día'],
          ] as const
        ).map(([span, txt]) => (
          <button key={span} type="button" onClick={() => setSpan(span)}>
            {txt}
          </button>
        ))}
        <span className="scrubber-hint">Arrastra la línea · la lupa marca la hora</span>
      </div>
    </div>
  );
}
