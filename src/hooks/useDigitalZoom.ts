import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Zoom digital sobre el video (no mueve la cámara): agranda la imagen con
 * CSS. Rueda del ratón o trackpad = acercar/alejar en el punto del cursor,
 * arrastrar = mover, doble clic = salir del zoom.
 */
export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

const MIN = 1;
const MAX = 8;
const NONE: ZoomState = { scale: 1, x: 0, y: 0 };

/** Evita que se vean bordes vacíos: la imagen siempre cubre el recuadro. */
function clamp(z: ZoomState, w: number, h: number): ZoomState {
  const scale = Math.min(MAX, Math.max(MIN, z.scale));
  if (scale === 1) return NONE;
  return {
    scale,
    x: Math.min(0, Math.max(w - w * scale, z.x)),
    y: Math.min(0, Math.max(h - h * scale, z.y)),
  };
}

export function useDigitalZoom() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<ZoomState>(NONE);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  /** Lleva el zoom a `scale`, dejando fijo el punto (px, py) del recuadro. */
  const zoomAt = useCallback((scale: number, px: number, py: number) => {
    const el = containerRef.current;
    if (!el) return;
    const { width: w, height: h } = el.getBoundingClientRect();
    setZoom((prev) => {
      const ratio = scale / prev.scale;
      return clamp(
        { scale, x: px - (px - prev.x) * ratio, y: py - (py - prev.y) * ratio },
        w,
        h,
      );
    });
  }, []);

  /** Desde coordenadas de pantalla (clic derecho, rueda). */
  const zoomAtClient = useCallback(
    (scale: number, clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      zoomAt(scale, clientX - rect.left, clientY - rect.top);
    },
    [zoomAt],
  );

  const reset = useCallback(() => setZoom(NONE), []);

  // Rueda: solo cuando ya hay zoom, para no robar el scroll de la página.
  // addEventListener con passive:false para poder evitar el scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (zoomRef.current.scale <= 1) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0025);
      zoomAtClient(zoomRef.current.scale * factor, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAtClient]);

  // Arrastrar para mover la imagen ampliada.
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 || zoomRef.current.scale <= 1) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    const el = containerRef.current;
    if (!d || d.id !== e.pointerId || !el) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    const { width: w, height: h } = el.getBoundingClientRect();
    setZoom((prev) => clamp({ ...prev, x: prev.x + dx, y: prev.y + dy }, w, h));
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }, []);

  return {
    containerRef,
    zoom,
    zoomed: zoom.scale > 1,
    zoomAtClient,
    reset,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    style: {
      transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
      transformOrigin: '0 0',
    } as const,
  };
}
