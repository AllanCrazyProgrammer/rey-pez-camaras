import { useCallback, useMemo, useState } from 'react';
import type { CameraConfig, DvrSettings } from '../lib/types';
import type { NamesSyncStatus } from '../lib/namesSync';
import {
  buildSetupLink,
  generateGo2rtcYaml,
  isInsecureBridge,
  maskRtspUrlSafe,
} from '../lib/rtsp';
import { channelLabel } from '../data/defaultCameras';
import { applyTheme, readTheme, THEMES, type ThemeId } from '../lib/theme';
import { ThemeModal } from './ThemeModal';

interface Props {
  settings: DvrSettings;
  updateSettings: (patch: Partial<DvrSettings>) => void;
  cameras: CameraConfig[];
  updateCamera: (id: number, patch: Partial<CameraConfig>) => void;
  namesStatus: NamesSyncStatus;
}

const NAMES_STATUS_TEXT: Record<NamesSyncStatus, string> = {
  local: 'Solo en este aparato',
  loading: 'Cargando…',
  synced: '✓ Iguales en todos tus aparatos',
  saving: 'Guardando…',
  error: 'Sin Mac mini: solo en este aparato',
};

/**
 * Ajustes: datos del DVR, dirección del puente, nombres de cámaras,
 * URLs RTSP (clave tapada) y generador de go2rtc.yaml.
 * Todo se guarda en localStorage al escribir; nada sale de este navegador.
 */
export function SettingsPanel({
  settings,
  updateSettings,
  cameras,
  updateCamera,
  namesStatus,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(readTheme);
  const [themeOpen, setThemeOpen] = useState(false);
  const pickTheme = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id);
  };
  const themeInfo = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  // El YAML solo se regenera si cambian ajustes o cámaras.
  const yaml = useMemo(
    () => generateGo2rtcYaml(settings, cameras),
    [settings, cameras],
  );

  const copyYaml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(yaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [yaml]);

  const downloadYaml = useCallback(() => {
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'go2rtc.yaml';
    a.click();
    URL.revokeObjectURL(url);
  }, [yaml]);

  const hasBridge = settings.bridgeUrl.trim() !== '';
  const insecure = isInsecureBridge(settings.bridgeUrl);

  // Link para dejar el puente guardado en otro aparato con un clic.
  const setupLink = useMemo(
    () => buildSetupLink(globalThis.location?.href ?? '', settings.bridgeUrl),
    [settings.bridgeUrl],
  );
  const [linkCopied, setLinkCopied] = useState(false);
  const copySetupLink = useCallback(async () => {
    if (!setupLink) return;
    try {
      await navigator.clipboard.writeText(setupLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setLinkCopied(false);
    }
  }, [setupLink]);

  return (
    <>
    <section className="panel settings" aria-label="Ajustes">
      <h2>Ajustes</h2>

      <fieldset>
        <legend>Apariencia</legend>
        <button type="button" className="setting-row" onClick={() => setThemeOpen(true)}>
          <span className="setting-label">Tema</span>
          <span className="palette palette--sm" aria-hidden="true">
            {themeInfo.swatches.map((c) => (
              <i key={c} style={{ background: c }} />
            ))}
          </span>
          <span className="setting-value">{themeInfo.name}</span>
          <span className="setting-go" aria-hidden="true">›</span>
        </button>
      </fieldset>

      <fieldset>
        <legend>Puente</legend>
        <label>
          Dirección
          <input
            type="url"
            inputMode="url"
            placeholder="https://mac-mini.tu-red.ts.net"
            value={settings.bridgeUrl}
            onChange={(e) => updateSettings({ bridgeUrl: e.target.value })}
            autoComplete="off"
          />
        </label>
        <p className={insecure ? 'warn' : hasBridge ? 'ok' : 'warn'} role={insecure ? 'alert' : undefined}>
          {insecure
            ? '⚠ Usa la dirección https:// de Tailscale.'
            : hasBridge
              ? '✓ Conectado'
              : 'Falta la dirección'}
        </p>
        {setupLink && (
          <button type="button" onClick={copySetupLink}>
            {linkCopied ? '✓ Link copiado' : 'Copiar link para otro aparato'}
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend>Cámaras · {cameras.length}</legend>
        <p className={`settings-status ${namesStatus === 'synced' ? 'ok' : namesStatus === 'error' ? 'warn' : ''}`}>
          {NAMES_STATUS_TEXT[namesStatus]}
        </p>
        <ul className="camera-list">
          {cameras.map((cam) => (
            <li key={cam.id}>
              <label className="camera-enable">
                <input
                  type="checkbox"
                  checked={cam.enabled}
                  onChange={(e) => updateCamera(cam.id, { enabled: e.target.checked })}
                  aria-label={`Activar ${cam.name}`}
                />
                <span>{channelLabel(cam)}</span>
              </label>
              <label>
                <span className="sr-only">Nombre de la cámara {channelLabel(cam)}</span>
                <input
                  type="text"
                  value={cam.name}
                  maxLength={60}
                  onChange={(e) => updateCamera(cam.id, { name: e.target.value })}
                  aria-label={`Nombre de la cámara ${channelLabel(cam)}`}
                />
              </label>
              <label>
                <span className="sr-only">Ubicación de la cámara {channelLabel(cam)}</span>
                <input
                  type="text"
                  value={cam.location}
                  maxLength={60}
                  onChange={(e) => updateCamera(cam.id, { location: e.target.value })}
                  aria-label={`Ubicación de la cámara ${channelLabel(cam)}`}
                />
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <details className="settings-advanced">
        <summary>
          Avanzado <small>DVR y archivo de la Mac mini</small>
        </summary>

        <fieldset>
          <legend>Dahua</legend>
          <label>
            IP
            <input
              type="text"
              inputMode="numeric"
              placeholder="192.168.1.108"
              value={settings.dvrIp}
              onChange={(e) => updateSettings({ dvrIp: e.target.value })}
              autoComplete="off"
            />
          </label>
          <div className="settings-pair">
            <label>
              Usuario
              <input
                type="text"
                value={settings.username}
                onChange={(e) => updateSettings({ username: e.target.value })}
                autoComplete="username"
              />
            </label>
            <label>
              Clave
              <input
                type="password"
                value={settings.password}
                onChange={(e) => updateSettings({ password: e.target.value })}
                autoComplete="current-password"
              />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Hikvision</legend>
          <label>
            IP
            <input
              type="text"
              inputMode="numeric"
              placeholder="192.168.1.x"
              value={settings.hikIp}
              onChange={(e) => updateSettings({ hikIp: e.target.value })}
              autoComplete="off"
            />
          </label>
          <div className="settings-pair">
            <label>
              Usuario
              <input
                type="text"
                value={settings.hikUsername}
                onChange={(e) => updateSettings({ hikUsername: e.target.value })}
                autoComplete="off"
              />
            </label>
            <label>
              Clave
              <input
                type="password"
                value={settings.hikPassword}
                onChange={(e) => updateSettings({ hikPassword: e.target.value })}
                autoComplete="off"
              />
            </label>
          </div>
        </fieldset>
        <p className="panel-note">Se guarda solo en este aparato. Solo hace falta en la Mac mini.</p>

        <fieldset>
          <legend>Direcciones RTSP</legend>
          <ul className="rtsp-list">
            {cameras
              .filter((c) => c.enabled)
              .map((cam) => (
                <li key={cam.id}>
                  <strong>{cam.name}</strong>
                  <code>{maskRtspUrlSafe(settings, cam, 0)}</code>
                  <code>{maskRtspUrlSafe(settings, cam, 1)}</code>
                </li>
              ))}
          </ul>
        </fieldset>

        <fieldset>
          <legend>go2rtc.yaml</legend>
          <p className="panel-note">Lleva la clave: guárdalo solo en la Mac mini.</p>
          <pre className="yaml">{yaml}</pre>
          <div className="row">
            <button type="button" onClick={copyYaml}>
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
            <button type="button" onClick={downloadYaml}>
              Descargar
            </button>
          </div>
        </fieldset>
      </details>
    </section>
    <ThemeModal
      open={themeOpen}
      current={theme}
      onPick={pickTheme}
      onClose={() => setThemeOpen(false)}
    />
    </>
  );
}
