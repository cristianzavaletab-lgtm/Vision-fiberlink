import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-2xl bg-status-error/10 border border-status-error/20 flex items-center justify-center">
              <AlertTriangle className="w-9 h-9 text-status-error" />
            </div>
            <div className="absolute inset-0 rounded-2xl border border-status-error/20 animate-ping opacity-20" />
          </div>

          <h2 className="text-xl font-bold text-text-primary mb-2">Algo salió mal</h2>
          <p className="text-sm text-text-secondary max-w-sm mb-2">
            Este módulo encontró un error inesperado. Tu sesión y datos están seguros.
          </p>

          {this.state.error && (
            <details className="mb-6 max-w-md w-full">
              <summary className="text-xs text-text-tertiary cursor-pointer hover:text-text-secondary transition-colors mb-2 select-none">
                Ver detalles técnicos
              </summary>
              <pre className="text-left text-[10px] bg-surface-elevated border border-surface-border rounded-xl p-3 overflow-auto text-status-error/80 max-h-32 custom-scrollbar whitespace-pre-wrap break-all">
                {this.state.error.message}
              </pre>
            </details>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-brand/20"
            >
              <RefreshCw className="w-4 h-4" />
              Reintentar
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-4 py-2.5 bg-surface-elevated text-text-secondary rounded-xl text-sm font-semibold hover:text-text-primary hover:bg-surface-border transition-all active:scale-95"
            >
              <Home className="w-4 h-4" />
              Recargar App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
