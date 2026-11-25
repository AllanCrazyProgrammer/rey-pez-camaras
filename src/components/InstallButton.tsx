import { useEffect, useState } from 'react';

/** Evento de Chrome/Edge/Samsung Internet cuando la página se puede instalar. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Chrome puede avisar antes de que React monte el botón: se guarda aquí.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(e: BeforeInstallPromptEvent | null) => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // en vez del aviso de Chrome, usamos nuestro botón
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn(deferred));
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn(null));
  });
}

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Botón "Instalar app": evita buscar la opción en el menú del navegador.
 * En iPhone/iPad no existe la instalación por botón: se muestra cómo
 * hacerlo con Compartir → Agregar a inicio. Ya instalada, no aparece.
 */
export function InstallButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(() => deferred);
  const [installed, setInstalled] = useState(isStandalone);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    const onChange = (e: BeforeInstallPromptEvent | null) => {
      setPrompt(e);
      if (!e && isStandalone()) setInstalled(true);
    };
    const onInstalled = () => setInstalled(true);
    listeners.add(onChange);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  if (prompt) {
    return (
      <button
        type="button"
        className="install-btn"
        onClick={async () => {
          await prompt.prompt();
          const { outcome } = await prompt.userChoice;
          if (outcome === 'accepted') setInstalled(true);
          deferred = null; // Chrome solo deja usar cada aviso una vez
          setPrompt(null);
        }}
      >
        📲 Instalar app
      </button>
    );
  }

  if (isIos()) {
    return (
      <span className="install-ios">
        <button type="button" className="install-btn" onClick={() => setIosHelp((v) => !v)}>
          📲 Instalar app
        </button>
        {iosHelp && (
          <span className="install-help" role="note">
            En Safari: botón Compartir (cuadro con flecha) → “Agregar a inicio”.
          </span>
        )}
      </span>
    );
  }

  return null;
}
