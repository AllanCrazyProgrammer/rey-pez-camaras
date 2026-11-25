import { useCallback, useMemo, useState } from 'react';
import type { CameraConfig, DvrSettings } from '../lib/types';
import { generateGo2rtcYaml, maskRtspUrlSafe } from '../lib/rtsp';

interface Props {
  settings: DvrSettings;
  updateSettings: (patch: Partial<DvrSettings>) => void;
  cameras: CameraConfig[];
  updateCamera: (id: number, patch: Partial<CameraConfig>) => void;
}

/**
 * Ajustes: datos del DVR, dirección del puente, nombres de cámaras,
 * URLs RTSP (clave tapada) y generador de go2rtc.yaml.
 * Todo se guarda en localStorage al escribir; nada sale de este navegador.
 */
export function SettingsPanel({ settings, updateSettings, cameras, updateCamera }: Props) {
  const [copied, setCopied] = useState(false);

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

  const configured = settings.dvrIp.trim() !== '' && settings.bridgeUrl.trim() !== '';

  return (
    <section className="panel" aria-label="Ajustes del DVR y cámaras">
      <h2>Ajustes</h2>
      <p className="panel-note">
        La IP y la clave se guardan solo en este navegador. Nunca se suben al
        repo ni a ningún servidor.
      </p>

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
          Puente go2rtc (en la bodega)
          <input
            type="text"
            placeholder="http://192.168.1.100:1984"
            value={settings.bridgeUrl}
            onChange={(e) => updateSettings({ bridgeUrl: e.target.value })}
            autoComplete="off"
          />
        </label>
        <p className={configured ? 'ok' : 'warn'}>
          {configured
            ? '✓ DVR y puente configurados.'
            : 'Falta la IP del DVR o la dirección del puente para ver video en vivo.'}
        </p>
      </fieldset>

      <fieldset>
        <legend>Cámaras ({cameras.length})</legend>
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
                <span>Canal {cam.channel}</span>
              </label>
              <label>
                <span className="sr-only">Nombre de la cámara {cam.channel}</span>
                <input
                  type="text"
                  value={cam.name}
                  onChange={(e) => updateCamera(cam.id, { name: e.target.value })}
                  aria-label={`Nombre de la cámara ${cam.channel}`}
                />
              </label>
              <label>
                <span className="sr-only">Ubicación de la cámara {cam.channel}</span>
                <input
                  type="text"
                  value={cam.location}
                  onChange={(e) => updateCamera(cam.id, { location: e.target.value })}
                  aria-label={`Ubicación de la cámara ${cam.channel}`}
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
                <code>{maskRtspUrlSafe(settings, cam.channel, 0)}</code>
                <code>{maskRtspUrlSafe(settings, cam.channel, 1)} (sub)</code>
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
