import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCameras } from './hooks/useCameras';
import { CameraGrid } from './components/CameraGrid';
import { CameraDetail } from './components/CameraDetail';
import { LightMosaic } from './components/LightMosaic';
import { MOSAIC_CHANNELS, MOSAIC_STREAM } from './data/mosaicLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BridgeSetupBanner } from './components/BridgeSetupBanner';
import { InstallButton } from './components/InstallButton';
import { useUpdateCheck } from './hooks/useUpdateCheck';
import { Capacitor } from '@capacitor/core';
import type { CameraConfig, DvrKind } from './lib/types';
import { buildHlsUrl, isInsecureBridge } from './lib/rtsp';
import './App.css';
import './themes/themes.css';

// Code-splitting (react.dev: lazy + Suspense): Ajustes y Guía solo se
// descargan cuando Allan abre esa pestaña, no al cargar el mosaico.
const SettingsPanel = lazy(() =>
  import('./components/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
);
const BridgeGuide = lazy(() =>
  import('./components/BridgeGuide').then((m) => ({ default: m.BridgeGuide })),
);

type Tab = 'grid' | 'settings' | 'guide';

/** Logo: el pez de Rey Pez (se pinta con el color del tema). */
function FishLogo() {
  return (
    <svg className="brand-fish" viewBox="0 0 48 32" aria-hidden="true">
      <path d="M3 16c6-9 18-12 28-6l9-6-2 12 2 12-9-6C21 28 9 25 3 16z" fill="currentColor" />
      <circle cx="12" cy="14" r="2" className="brand-fish-eye" />
    </svg>
  );
}

const ICONS: Record<Tab, string> = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  settings: 'M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  guide: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5',
};

/** Reloj de la barra de arriba (hora de 12 h). */
function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  const h = now.getHours();
  return (
    <span className="header-clock" aria-label="Hora">
      {h % 12 === 0 ? 12 : h % 12}:{String(now.getMinutes()).padStart(2, '0')}
      <small>{h < 12 ? 'AM' : 'PM'}</small>
    </span>
  );
}

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

/**
 * Cuántas columnas hacen las cámaras (16:9) más grandes en una pantalla
 * de w x h. Ej.: 14 cámaras en un celular acostado → 5 por fila.
 */
function bestFitCols(count: number, w: number, h: number): number {
  if (!count || !w || !h) return 4;
  let best = 1;
  let bestW = 0;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const tileW = Math.min(w / cols, ((h - rows * 4) / rows) * (16 / 9));
    if (tileW > bestW + 0.5) {
      bestW = tileW;
      best = cols;
    }
  }
  return best;
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
  // Pantalla completa del mosaico (laptops y pantallas). iPhone no la tiene.
  const mosaicRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled === true;
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === mosaicRef.current && !!mosaicRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  // En pantalla completa las columnas se eligen solas para que las cámaras
  // salgan lo más grandes posible (celular acostado, laptop, tele).
  const [screenSize, setScreenSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!isFullscreen) return;
    const read = () => setScreenSize({ w: window.innerWidth, h: window.innerHeight });
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, [isFullscreen]);
  const toggleMosaicFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void mosaicRef.current?.requestFullscreen().catch(() => undefined);
  }, []);
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

  // Botón "atrás" de Android en la APK: primero cierra la cámara abierta,
  // luego sale de pantalla completa, luego regresa de Ajustes/Guía al
  // mosaico. En el mosaico, manda la app al fondo (no la cierra).
  const backRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    backRef.current = () => {
      // Con una cámara abierta en pantalla completa, atrás regresa al
      // mosaico sin salir de pantalla completa.
      if (selectedId !== null) closeCamera();
      else if (document.fullscreenElement) void document.exitFullscreen();
      else if (tab !== 'grid') setTab('grid');
      else void import('@capacitor/app').then(({ App: CapApp }) => CapApp.minimizeApp());
    };
  }, [selectedId, tab, closeCamera]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    let remove: (() => void) | undefined;
    void import('@capacitor/app').then(({ App: CapApp }) =>
      CapApp.addListener('backButton', () => backRef.current()).then((h) => {
        if (cancelled) void h.remove();
        else remove = () => void h.remove();
      }),
    );
    return () => {
      cancelled = true;
      remove?.();
    };
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
        <div className="brand">
          <FishLogo />
          <div>
            <h1>Rey Pez</h1>
            <p>Bodega · {activeCameras.length} cámaras</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Secciones">
          {(
            [
              ['grid', 'Mosaico'],
              ['settings', 'Ajustes'],
              ['guide', 'Guía'],
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
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={ICONS[id]} />
              </svg>
              {label}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <InstallButton />
          <span
            className={`bridge-badge ${bridgeOk && !bridgeInsecure ? 'bridge-badge--ok' : ''}`}
          >
            <i aria-hidden="true" />
            {bridgeInsecure
              ? 'Puente sin HTTPS'
              : bridgeOk
                ? 'Puente conectado'
                : 'Puente sin configurar'}
          </span>
          <HeaderClock />
        </div>
      </header>

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
              <button
                type="button"
                className="fs-btn refresh-btn"
                onClick={() => setRefreshKey((k) => k + 1)}
                title="Volver a conectar todas las cámaras"
              >
                ⟳ Recargar
              </button>
              {canFullscreen && (
                <button
                  type="button"
                  className="fs-btn"
                  onClick={toggleMosaicFullscreen}
                  title="Ver el mosaico en pantalla completa (Esc para salir)"
                >
                  ⛶ Pantalla completa
                </button>
              )}
              </div>
            )}
            {tab === 'grid' && (() => {
              const tileCount =
                viewMode === 'ligero'
                  ? tabCameras.filter((c) => MOSAIC_CHANNELS[dvrTab].includes(c.channel)).length
                  : tabCameras.length;
              const cols = isFullscreen
                ? bestFitCols(tileCount, screenSize.w, screenSize.h)
                : settings.gridCols;
              return (
              <div
                ref={mosaicRef}
                className="mosaic-fs"
                style={
                  {
                    '--cols': cols,
                    '--rows': Math.max(1, Math.ceil(tileCount / cols)),
                  } as React.CSSProperties
                }
              >
                {isFullscreen &&
                  (selected ? (
                    <button type="button" className="fs-exit" onClick={closeCamera}>
                      ← Mosaico
                    </button>
                  ) : (
                    <button type="button" className="fs-exit" onClick={toggleMosaicFullscreen}>
                      ✕ Salir
                    </button>
                  ))}
                {selected ? (
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
                    gridCols={cols}
                    onColsChange={(cols) => updateSettings({ gridCols: cols })}
                    onSelect={handleSelect}
                    onMove={moveCamera}
                  />
                ) : (
                  <CameraGrid
                    key={`${dvrTab}-${refreshKey}`}
                    cameras={tabCameras}
                    gridCols={cols}
                    onColsChange={(cols) => updateSettings({ gridCols: cols })}
                    hlsUrlFor={hlsUrlFor}
                    onSelect={handleSelect}
                    onRename={handleRename}
                    onMove={moveCamera}
                  />
                )}
              </div>
              );
            })()}

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
    </div>
  );
}
