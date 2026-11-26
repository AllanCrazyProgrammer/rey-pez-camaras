import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useCameras } from './hooks/useCameras';
import { CameraGrid } from './components/CameraGrid';
import { CameraDetail } from './components/CameraDetail';
import { LightMosaic } from './components/LightMosaic';
import { MOSAIC_STREAM } from './data/mosaicLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BridgeSetupBanner } from './components/BridgeSetupBanner';
import { InstallButton } from './components/InstallButton';
import { useUpdateCheck } from './hooks/useUpdateCheck';
import type { CameraConfig, DvrKind } from './lib/types';
import { buildHlsUrl, isInsecureBridge } from './lib/rtsp';
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

/** Marca en history.state de que está abierta la vista grande. */
const CAMERA_STATE = 'reyPezCamara';
const DVR_TAB_KEY = 'rey-pez-camaras:dvr-tab/v1';
const DVR_TABS: [DvrKind, string][] = [
  ['dahua', 'Dahua'],
  ['hik', 'Hikvision'],
];

/** Vista del mosaico: un video por cámara o un solo video armado en la Mac mini. */
type ViewMode = 'normal' | 'ligero';
const VIEW_MODE_KEY = 'rey-pez-camaras:view-mode/v1';

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'ligero' ? 'ligero' : 'normal';
  } catch {
    return 'normal';
  }
}

function readDvrTab(): DvrKind {
  try {
    return localStorage.getItem(DVR_TAB_KEY) === 'hik' ? 'hik' : 'dahua';
  } catch {
    return 'dahua';
  }
}

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
  // Pestaña de DVR del mosaico: cada aparato recuerda la última que vio.
  const [dvrTab, setDvrTab] = useState<DvrKind>(readDvrTab);
  useEffect(() => {
    try {
      localStorage.setItem(DVR_TAB_KEY, dvrTab);
    } catch {
      /* sin storage: solo dura esta visita */
    }
  }, [dvrTab]);
  // Cada aparato recuerda si usa la vista ligera o la normal.
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      /* sin storage: solo dura esta visita */
    }
  }, [viewMode]);
  const tabCameras = useMemo(
    () => activeCameras.filter((c) => c.dvr === dvrTab),
    [activeCameras, dvrTab],
  );
  // Cambiarlo vuelve a montar los reproductores: reconecta todas las cámaras.
  const [refreshKey, setRefreshKey] = useState(0);
  const updateReady = useUpdateCheck();

  // Al volver el WiFi o los datos, reconectar las cámaras solas.
  useEffect(() => {
    const onOnline = () => setRefreshKey((k) => k + 1);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

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

  // Vista grande = una entrada en el historial. Así "atrás" (botón del
  // navegador o el de Android en la APK) regresa al mosaico en vez de
  // salir de la app.
  useEffect(() => {
    // Al recargar, el historial puede traer la marca vieja: se limpia.
    if (history.state?.[CAMERA_STATE]) history.replaceState(null, '');
    const onPop = () => setSelectedId(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleSelect = useCallback((camera: CameraConfig) => {
    setSelectedId(camera.id);
    if (!history.state?.[CAMERA_STATE]) history.pushState({ [CAMERA_STATE]: true }, '');
  }, []);

  const closeCamera = useCallback(() => {
    // history.back() dispara popstate, que cierra la vista grande.
    if (history.state?.[CAMERA_STATE]) history.back();
    else setSelectedId(null);
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => {
      setSelectedId((current) => {
        if (current === null) return current;
        // Anterior / siguiente sin salir de la pestaña de su DVR.
        const idx = tabCameras.findIndex((c) => c.id === current);
        if (idx === -1) return current;
        const next = tabCameras[(idx + dir + tabCameras.length) % tabCameras.length];
        return next.id;
      });
    },
    [tabCameras],
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
          <p>Dahua + Hikvision · {activeCameras.length} cámaras</p>
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
              closeCamera();
            }}
          >
            {label}
          </button>
        ))}
        {tab === 'grid' && (
          <button
            type="button"
            className="refresh-btn"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Volver a conectar todas las cámaras"
          >
            ⟳ Actualizar cámaras
          </button>
        )}
      </nav>

      {updateReady && (
        <div className="update-banner" role="status">
          <span>Hay una versión nueva de la app.</span>
          <button type="button" onClick={() => location.reload()}>
            Actualizar ahora
          </button>
        </div>
      )}

      <main>
        <ErrorBoundary>
          <Suspense fallback={<p className="loading">Cargando…</p>}>
            {tab === 'grid' && !bridgeOk && (
              <BridgeSetupBanner onSave={(bridgeUrl) => updateSettings({ bridgeUrl })} />
            )}
            {tab === 'grid' && !selected && (
              <div className="mosaic-bar">
              <div className="dvr-tabs" role="tablist" aria-label="DVR">
                {DVR_TABS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={dvrTab === id}
                    className={dvrTab === id ? 'tab-active' : ''}
                    onClick={() => setDvrTab(id)}
                  >
                    {label}{' '}
                    <span className="dvr-tab-count">
                      {activeCameras.filter((c) => c.dvr === id).length}
                    </span>
                  </button>
                ))}
              </div>
              <div className="view-mode" role="group" aria-label="Vista del mosaico">
                {(
                  [
                    ['ligero', 'Ligero', 'Un solo video: menos datos y batería'],
                    ['normal', 'Normal', 'Un video por cámara'],
                  ] as const
                ).map(([id, label, title]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={viewMode === id}
                    title={title}
                    onClick={() => setViewMode(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              </div>
            )}
            {tab === 'grid' &&
              (selected ? (
                <CameraDetail
                  key={`${selected.id}-${refreshKey}`}
                  camera={selected}
                  settings={settings}
                  hlsUrl={hlsUrlFor(selected, true)}
                  onClose={closeCamera}
                  onPrev={() => step(-1)}
                  onNext={() => step(1)}
                />
              ) : viewMode === 'ligero' ? (
                <LightMosaic
                  key={`ligero-${dvrTab}-${refreshKey}`}
                  dvr={dvrTab}
                  cameras={cameras}
                  hlsUrl={buildHlsUrl(settings.bridgeUrl, MOSAIC_STREAM[dvrTab])}
                  gridCols={settings.gridCols}
                  onColsChange={(cols) => updateSettings({ gridCols: cols })}
                  onSelect={handleSelect}
                />
              ) : (
                <CameraGrid
                  key={`${dvrTab}-${refreshKey}`}
                  cameras={tabCameras}
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
