import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useCameras } from './hooks/useCameras';
import { CameraGrid } from './components/CameraGrid';
import { CameraDetail } from './components/CameraDetail';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BridgeSetupBanner } from './components/BridgeSetupBanner';
import { InstallButton } from './components/InstallButton';
import type { CameraConfig } from './lib/types';
import { isInsecureBridge } from './lib/rtsp';
import './App.css';

// Code-splitting (react.dev: lazy + Suspense): Ajustes y Guía solo se
// descargan cuando Allan abre esa pestaña, no al cargar el mosaico.
const SettingsPanel = lazy(() =>
  import('./components/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
);
const BridgeGuide = lazy(() =>
  import('./components/BridgeGuide').then((m) => ({ default: m.BridgeGuide })),
);

type Tab = 'grid' | 'settings' | 'guide';

export default function App() {
  const {
    settings,
    updateSettings,
    cameras,
    activeCameras,
    updateCamera,
    moveCamera,
    hlsUrlFor,
    namesStatus,
  } = useCameras();
  const [tab, setTab] = useState<Tab>('grid');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = useMemo(
    () => activeCameras.find((c) => c.id === selectedId) ?? null,
    [activeCameras, selectedId],
  );

  const handleRename = useCallback(
    (id: number, name: string) => updateCamera(id, { name }),
    [updateCamera],
  );

  // Barra espaciadora = recargar la página (si el video se trabó), salvo
  // cuando se está escribiendo en un campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      location.reload();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSelect = useCallback((camera: CameraConfig) => {
    setSelectedId(camera.id);
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => {
      setSelectedId((current) => {
        if (current === null) return current;
        const idx = activeCameras.findIndex((c) => c.id === current);
        if (idx === -1) return current;
        const next = activeCameras[(idx + dir + activeCameras.length) % activeCameras.length];
        return next.id;
      });
    },
    [activeCameras],
  );

  // Para ver video solo hace falta el puente; la IP del DVR solo sirve
  // para generar el go2rtc.yaml en la Mac mini.
  const bridgeOk = settings.bridgeUrl.trim() !== '';
  const bridgeInsecure = useMemo(
    () => isInsecureBridge(settings.bridgeUrl),
    [settings.bridgeUrl],
  );

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Cámaras · Bodega Rey Pez</h1>
          <p>Dahua DH-XVR1B16H-I/T · {activeCameras.length} cámaras · solo Dahua</p>
        </div>
        <div className="header-actions">
        <InstallButton />
        <span
          className={`bridge-badge ${bridgeOk && !bridgeInsecure ? 'bridge-badge--ok' : ''}`}
        >
          {bridgeInsecure
            ? 'Puente sin HTTPS'
            : bridgeOk
              ? 'Puente configurado'
              : 'Puente sin configurar'}
        </span>
        </div>
      </header>

      <nav className="tabs" aria-label="Secciones">
        {(
          [
            ['grid', 'Mosaico'],
            ['settings', 'Ajustes'],
            ['guide', 'Guía del puente'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? 'page' : undefined}
            className={tab === id ? 'tab-active' : ''}
            onClick={() => {
              setTab(id);
              setSelectedId(null);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <main>
        <ErrorBoundary>
          <Suspense fallback={<p className="loading">Cargando…</p>}>
            {tab === 'grid' && !bridgeOk && (
              <BridgeSetupBanner onSave={(bridgeUrl) => updateSettings({ bridgeUrl })} />
            )}
            {tab === 'grid' &&
              (selected ? (
                <CameraDetail
                  key={selected.id}
                  camera={selected}
                  settings={settings}
                  hlsUrl={hlsUrlFor(selected, true)}
                  onClose={() => setSelectedId(null)}
                  onPrev={() => step(-1)}
                  onNext={() => step(1)}
                />
              ) : (
                <CameraGrid
                  cameras={activeCameras}
                  gridCols={settings.gridCols}
                  onColsChange={(cols) => updateSettings({ gridCols: cols })}
                  hlsUrlFor={hlsUrlFor}
                  onSelect={handleSelect}
                  onRename={handleRename}
                  onMove={moveCamera}
                />
              ))}
            {tab === 'settings' && (
              <SettingsPanel
                settings={settings}
                updateSettings={updateSettings}
                cameras={cameras}
                updateCamera={updateCamera}
                namesStatus={namesStatus}
              />
            )}
            {tab === 'guide' && <BridgeGuide />}
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className="app-footer">
        <p>
          El video llega por el puente go2rtc de la bodega. Sin puente, las
          cámaras muestran su estado real (“Sin puente” / “Sin señal”), nunca
          video falso.
        </p>
      </footer>
    </div>
  );
}
