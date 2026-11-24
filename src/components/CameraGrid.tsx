import { useCallback } from 'react';
import type { CameraConfig } from '../lib/types';
import { CameraTile } from './CameraTile';

interface Props {
  cameras: CameraConfig[];
  gridCols: 2 | 3 | 4;
  onColsChange: (cols: 2 | 3 | 4) => void;
  hlsUrlFor: (camera: CameraConfig, main: boolean) => string | null;
  onSelect: (camera: CameraConfig) => void;
}

export function CameraGrid({ cameras, gridCols, onColsChange, hlsUrlFor, onSelect }: Props) {
  // useCallback estable: los tiles memoizados no se re-renderizan por
  // una función nueva en cada render del padre.
  const handleSelect = useCallback(
    (camera: CameraConfig) => onSelect(camera),
    [onSelect],
  );

  if (cameras.length === 0) {
    return <p className="empty">No hay cámaras activas. Actívalas en la pestaña Cámaras.</p>;
  }

  return (
    <section aria-label="Mosaico de cámaras">
      <div className="grid-toolbar">
        <span>
          {cameras.length} cámaras · substream (ahorra ancho de banda)
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
      <div className="grid" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
        {cameras.map((camera) => (
          <CameraTile
            key={camera.id}
            camera={camera}
            hlsUrl={hlsUrlFor(camera, false)}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </section>
  );
}
