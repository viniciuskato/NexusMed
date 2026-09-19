import React from 'react';
import { clientErrorReporter } from '../lib/clientErrorReporter';

// NOVO-01 — sem um error boundary, qualquer erro ao abrir uma tela (inclusive
// o arquivo da tela não existir mais depois de um deploy) desmonta o app
// inteiro e deixa a tela em branco. Este boundary envolve só a área das
// telas: a navegação continua de pé, e trocar de tela (`resetKey`) limpa o
// aviso. O erro vai para o registro de erros do cliente (NOVO-02).

interface Props {
  resetKey: string;
  children: React.ReactNode;
}

interface State {
  erro: Error | null;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary] falha ao exibir a tela', erro, info.componentStack);
    clientErrorReporter.report('boundary', erro);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.erro && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ erro: null });
    }
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div
        id="app-load-error"
        role="alert"
        className="max-w-md mx-auto my-16 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center"
      >
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          Não foi possível abrir esta tela
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Pode ter saído uma versão nova do NexusMed ou a conexão caiu. Recarregar a página costuma resolver.
        </p>
        <button
          id="btn-app-load-error-reload"
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold cursor-pointer transition-colors"
        >
          Recarregar
        </button>
      </div>
    );
  }
}
