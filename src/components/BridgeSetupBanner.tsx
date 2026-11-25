import { useState } from 'react';
import { bridgeFromPasted } from '../lib/rtsp';

interface Props {
  onSave: (bridgeUrl: string) => void;
}

/**
 * Se muestra cuando este aparato no tiene puente guardado (por ejemplo, la
 * app recién instalada en iPhone, que no comparte lo guardado en Safari).
 * Basta pegar el link de "Copiar link para otro aparato".
 */
export function BridgeSetupBanner({ onSave }: Props) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);

  const save = () => {
    const bridge = bridgeFromPasted(text);
    if (!bridge) {
      setInvalid(true);
      return;
    }
    onSave(bridge);
  };

  return (
    <form
      className="bridge-setup"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p>
        <strong>Falta conectar este aparato.</strong> Pega el link del puente
        (en otro aparato: Ajustes → “Copiar link para otro aparato”) y prende
        Tailscale.
      </p>
      <div className="row">
        <input
          type="url"
          inputMode="url"
          placeholder="https://…#puente=https://…ts.net"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid(false);
          }}
          aria-label="Link del puente"
          autoComplete="off"
        />
        <button type="submit">Conectar</button>
      </div>
      {invalid && (
        <p className="warn" role="alert">
          Ese link no sirve: debe traer una dirección https://….ts.net de Tailscale.
        </p>
      )}
    </form>
  );
}
