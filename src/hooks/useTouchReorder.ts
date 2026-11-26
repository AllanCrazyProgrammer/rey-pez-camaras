import { useEffect, useRef } from 'react';

/**
 * Reordenar cámaras con el dedo: mantener presionada una cámara ~1/3 de
 * segundo y soltarla sobre otra. La movida toma el lugar de la otra.
 * (El arrastre nativo del navegador solo sirve con ratón.)
 * `selector` encuentra las baldosas, que deben traer data-camera-id.
 */
export function useTouchReorder(
  onMove: (fromId: number, toId: number) => void,
  selector: string,
  enabled: boolean,
) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const HOLD_MS = 350;
    const SLOP_PX = 10;
    const EDGE_PX = 70;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let scroller: ReturnType<typeof setInterval> | undefined;
    let start: { x: number; y: number; id: number; el: HTMLElement } | null = null;
    let active = false;
    let over: HTMLElement | null = null;
    let lastY = 0;

    const tileAt = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest<HTMLElement>(selector) ?? null;
    const clear = () => {
      clearTimeout(timer);
      clearInterval(scroller);
      start?.el.classList.remove('tile--dragging');
      over?.classList.remove('tile--drop');
      grid.classList.remove('grid--touch-drag');
      start = null;
      active = false;
      over = null;
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return clear();
      const target = e.target as Element;
      if (target.closest('input, .tile-rename')) return;
      const el = target.closest<HTMLElement>(selector);
      if (!el) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, id: Number(el.dataset.cameraId), el };
      lastY = t.clientY;
      timer = setTimeout(() => {
        if (!start) return;
        active = true;
        start.el.classList.add('tile--dragging');
        grid.classList.add('grid--touch-drag');
        navigator.vibrate?.(25);
        // Si el dedo está cerca del borde de la pantalla, la página se desplaza sola.
        scroller = setInterval(() => {
          if (lastY < EDGE_PX) window.scrollBy(0, -14);
          else if (lastY > window.innerHeight - EDGE_PX) window.scrollBy(0, 14);
        }, 16);
      }, HOLD_MS);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      if (!active) {
        // Se movió antes de tiempo: es scroll normal, no arrastre.
        if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > SLOP_PX) clear();
        return;
      }
      e.preventDefault();
      lastY = t.clientY;
      const target = tileAt(t.clientX, t.clientY);
      const next = target && target !== start.el ? target : null;
      if (next !== over) {
        over?.classList.remove('tile--drop');
        next?.classList.add('tile--drop');
        over = next;
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      if (active) {
        e.preventDefault(); // que no abra la cámara al soltar
        if (over) onMoveRef.current(start.id, Number(over.dataset.cameraId));
      }
      clear();
    };
    // Mantener presionado no debe abrir el menú del sistema sobre el video.
    const onContext = (e: Event) => {
      if (start) e.preventDefault();
    };
    grid.addEventListener('touchstart', onStart, { passive: true });
    grid.addEventListener('touchmove', onTouchMove, { passive: false });
    grid.addEventListener('touchend', onEnd, { passive: false });
    grid.addEventListener('touchcancel', clear);
    grid.addEventListener('contextmenu', onContext);
    return () => {
      clear();
      grid.removeEventListener('touchstart', onStart);
      grid.removeEventListener('touchmove', onTouchMove);
      grid.removeEventListener('touchend', onEnd);
      grid.removeEventListener('touchcancel', clear);
      grid.removeEventListener('contextmenu', onContext);
    };
  }, [enabled, selector]);

  return gridRef;

}
