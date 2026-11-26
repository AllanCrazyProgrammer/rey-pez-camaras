import { useCallback } from 'react';
import { useTouchReorder } from '../hooks/useTouchReorder';
import type { CameraConfig } from '../lib/types';
import { CameraTile } from './CameraTile';

interface Props {
  cameras: CameraConfig[];
  /** Columnas (2-4 elegidas por Allan; en pantalla completa se calculan). */
  gridCols: number;
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
  const gridRef = useTouchReorder(onMove, '.tile[data-camera-id]', cameras.length > 0);

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
