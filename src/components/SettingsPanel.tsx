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

interface Props {
  settings: DvrSettings;
  updateSettings: (patch: Partial<DvrSettings>) => void;
  cameras: CameraConfig[];
  updateCamera: (id: number, patch: Partial<CameraConfig>) => void;
  namesStatus: NamesSyncStatus;
}

const NAMES_STATUS_TEXT: Record<NamesSyncStatus, string> = {
  local: 'Sin puente: los nombres se guardan solo en este aparato.',
  loading: 'Cargando nombres de la Mac mini…',
  synced: '✓ Nombres guardados en la Mac mini: se ven igual en todos tus aparatos.',
  saving: 'Guardando en la Mac mini…',
  error: 'No se pudo hablar con la Mac mini: por ahora los nombres quedan solo en este aparato.',
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
  const pickTheme = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id);
  };

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
    <section className="panel" aria-label="Ajustes del DVR y cámaras">
      <h2>Ajustes</h2>
      <p className="panel-note">
        La IP y la clave se guardan solo en este navegador. Nunca se suben al
        repo ni a ningún servidor.
      </p>

      <fieldset>
        <legend>Apariencia</legend>
        <p className="panel-note">Solo cambia cómo se ve; cada aparato guarda el suyo.</p>
        <div className="theme-grid" role="radiogroup" aria-label="Tema de la app">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              className={`theme-card${theme === t.id ? ' theme-card--on' : ''}`}
              data-preview={t.id}
              onClick={() => pickTheme(t.id)}
            >
              <span className="theme-swatches" aria-hidden="true">
                {t.swatches.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              <b>{t.name}</b>
              <small>{t.description}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>DVR Dahua DH-XVR1B16H-I/T</legend>
        <label>
          IP local del DVR
          <input
            type="text"
            inputMode="numeric"
            placeholder="192.168.1.108"
            value={settings.dvrIp}
            onChange={(e) => updateSettings({ dvrIp: e.target.value })}
            autoComplete="off"
          />
        </label>
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
        <label>
          Puente go2rtc (dirección https de Tailscale de la Mac mini)
          <input
            type="url"
            inputMode="url"
            placeholder="https://mac-mini.tu-red.ts.net"
            value={settings.bridgeUrl}
            onChange={(e) => updateSettings({ bridgeUrl: e.target.value })}
            autoComplete="off"
          />
        </label>
        {insecure ? (
          <p className="warn" role="alert">
            ⚠ El puente es <code>http://</code> y esta app está en{' '}
            <code>https://</code>: el navegador bloquea el video. Pon la
            dirección https que da Tailscale Serve en la Mac mini, por ejemplo{' '}
            <code>https://mac-mini.tu-red.ts.net</code> (Guía del puente, paso
            5). En Chrome, en la misma Mac mini, también sirve{' '}
            <code>http://localhost:1984</code> para probar.
          </p>
        ) : (
          <p className={hasBridge ? 'ok' : 'warn'}>
            {hasBridge
              ? '✓ Puente configurado: con esto ya se ve el video en este aparato.'
              : 'Falta la dirección del puente para ver video en vivo.'}
          </p>
        )}
        {setupLink && (
          <div className="setup-link">
            <p className="panel-note">
              Para ver las cámaras en otro aparato (laptop, celular, pantalla):
              copia este link y ábrelo ahí, con Tailscale prendido. Deja el
              puente guardado solo, sin escribir nada.
            </p>
            <button type="button" onClick={copySetupLink}>
              {linkCopied ? '✓ Link copiado' : 'Copiar link para otro aparato'}
            </button>
          </div>
        )}
        <p className="panel-note">
          La IP, el usuario y la clave del DVR solo hacen falta en la Mac mini,
          para generar el go2rtc.yaml.
        </p>
      </fieldset>

      <fieldset>
        <legend>DVR Hikvision DS-7216HQHI-K1</legend>
        <label>
          IP local del Hikvision
          <input
            type="text"
            inputMode="numeric"
            placeholder="192.168.1.x"
            value={settings.hikIp}
            onChange={(e) => updateSettings({ hikIp: e.target.value })}
            autoComplete="off"
          />
        </label>
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
        <p className="panel-note">
          Igual que el Dahua: solo hace falta en la Mac mini para el
          go2rtc.yaml. Sin IP, el Hikvision no entra en el archivo.
        </p>
      </fieldset>

      <fieldset>
        <legend>Cámaras ({cameras.length})</legend>
        <p className={namesStatus === 'synced' ? 'ok' : namesStatus === 'error' ? 'warn' : 'panel-note'}>
          {NAMES_STATUS_TEXT[namesStatus]}
        </p>
        <p className="panel-note">
          También puedes cambiar el nombre desde el mosaico con el lápiz ✎.
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

      <fieldset>
        <legend>Direcciones RTSP (clave oculta)</legend>
        <ul className="rtsp-list">
          {cameras
            .filter((c) => c.enabled)
            .map((cam) => (
              <li key={cam.id}>
                <strong>
                  {cam.name} · {cam.location}
                </strong>
                <code>{maskRtspUrlSafe(settings, cam, 0)}</code>
                <code>{maskRtspUrlSafe(settings, cam, 1)} (sub)</code>
              </li>
            ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend>Puente go2rtc — archivo generado</legend>
        <p className="panel-note">
          Este archivo lleva la clave real: guárdalo solo en la compu de la
          bodega, nunca en GitHub.
        </p>
        <pre className="yaml">{yaml}</pre>
        <div className="row">
          <button type="button" onClick={copyYaml}>
            {copied ? '✓ Copiado' : 'Copiar go2rtc.yaml'}
          </button>
          <button type="button" onClick={downloadYaml}>
            Descargar go2rtc.yaml
          </button>
        </div>
      </fieldset>
    </section>
  );
}
