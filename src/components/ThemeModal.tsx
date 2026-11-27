import { useEffect, useRef } from 'react';
import { THEMES, type ThemeId } from '../lib/theme';

interface Props {
  open: boolean;
  current: ThemeId;
  onPick: (id: ThemeId) => void;
  onClose: () => void;
}

/** Ventana para elegir el tema: nombre y paleta de cada uno. */
export function ThemeModal({ open, current, onPick, onClose }: Props) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal theme-modal"
      aria-labelledby="theme-modal-title"
      onClose={onClose}
      onClick={(e) => {
        // Tocar fuera de la ventana la cierra.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box">
        <header className="modal-head">
          <h3 id="theme-modal-title">Tema</h3>
          <button type="button" className="modal-close" aria-label="Cerrar" onClick={onClose}>
            ✕
          </button>
        </header>
        <ul className="theme-list" role="radiogroup" aria-label="Tema de la app">
          {THEMES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                role="radio"
                aria-checked={current === t.id}
                className={`theme-row${current === t.id ? ' theme-row--on' : ''}`}
                onClick={() => onPick(t.id)}
              >
                <span className="palette" aria-hidden="true">
                  {t.swatches.map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </span>
                <b>{t.name}</b>
                <span className="theme-check" aria-hidden="true">
                  {current === t.id ? '✓' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="modal-done" onClick={onClose}>
          Listo
        </button>
      </div>
    </dialog>
  );
}
