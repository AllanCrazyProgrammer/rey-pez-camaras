import { Component, type ReactNode } from 'react';

/**
 * ErrorBoundary: el único componente de clase de la app.
 * React exige clase para capturar errores de render (react.dev:
 * "Error Boundaries" — no hay equivalente con hooks).
 */
interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error('Error en el visor de cámaras:', error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-fallback" role="alert">
          <h2>Algo falló al mostrar las cámaras</h2>
          <p>Recarga la página. Tus ajustes y nombres de cámaras están guardados.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
