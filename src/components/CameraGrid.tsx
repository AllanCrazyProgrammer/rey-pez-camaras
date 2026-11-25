import { useCallback, useEffect, useRef } from 'react';
import type { CameraConfig } from '../lib/types';
import { CameraTile } from './CameraTile';

interface Props {
  cameras: CameraConfig[];
  gridCols: 2 | 3 | 4;
  onColsChange: (cols: 2 | 3 | 4) => void;
  hlsUrlFor: (camera: CameraConfig, main: boolean) => string | null;
  onSelect: (camera: CameraConfig) => void;
  onRename: (id: number, name: string) => void;
  onMove: (fromId: number, toId: number) => void;
}

export function CameraGrid({
  cameras,
  gridCols,
  onColsChange,
  hlsUrlFor,
  onSelect,
  onRename,
  onMove,
}: Props) {
  // useCallback estable: los tiles memoizados no se re-renderizan por
  // una función nueva en cada render del padre.
  const handleSelect = useCallback(
    (camera: CameraConfig) => onSelect(camera),
    [onSelect],
  );

  // Arrastrar con el dedo: mantener presionada una cámara ~1/3 de segundo
  // y moverla. (El arrastre nativo del navegador solo sirve con ratón.)
  const gridRef = useRef<HTMLDivElement | null>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);
  const hasCameras = cameras.length > 0;
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
      document.elementFromPoint(x, y)?.closest<HTMLElement>('.tile[data-camera-id]') ?? null;
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
      const el = target.closest<HTMLElement>('.tile[data-camera-id]');
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
  }, [hasCameras]);

  if (cameras.length === 0) {
    return <p className="empty">No hay cámaras activas. Actívalas en Ajustes.</p>;
  }

  return (
    <section aria-label="Mosaico de cámaras">
      <div className="grid-toolbar">
        <span>
          {cameras.length} cámaras · arrastra para acomodarlas (con el dedo: mantén presionado) · espacio recarga
        </span>
        <div className="grid-cols" role="group" aria-label="Columnas del mosaico">
          {([2, 3, 4] as const).map((cols) => (
            <button
              key={cols}
              type="button"
              aria-pressed={gridCols === cols}
              onClick={() => onColsChange(cols)}
            >
              {cols}×{cols}
            </button>
          ))}
        </div>
      </div>
      <div ref={gridRef} className="grid" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
        {cameras.map((camera) => (
          <CameraTile
            key={camera.id}
            camera={camera}
            hlsUrl={hlsUrlFor(camera, false)}
            onSelect={handleSelect}
            onRename={onRename}
            onMove={onMove}
          />
        ))}
      </div>
    </section>
  );
}
