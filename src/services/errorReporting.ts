// NOVO-02 — registro de erros do cliente. Lógica pura, sem Supabase: quem
// envia é injetado (ver src/lib/clientErrorReporter.ts), o que deixa isto
// testável sem rede. Regras: nunca lançar, nunca mandar token da URL, não
// repetir o mesmo erro e não passar de um limite por sessão.

export type ClientErrorKind = 'error' | 'unhandledrejection' | 'boundary';

export interface ClientErrorPayload {
  kind: ClientErrorKind;
  message: string;
  stack: string | null;
  url: string;
  release: string;
  userAgent: string;
}

interface ReporterOptions {
  send: (payload: ClientErrorPayload) => unknown;
  release: string;
  userAgent: string;
  currentUrl: () => string;
  maxPerSession?: number;
}

const ROTA_DO_APP = /^#\/[\w-]+/;

/** Só o caminho e a rota `#/tela`: query string e hash de token (recuperação de senha) nunca saem. */
export function sanitizeUrl(href: string): string {
  try {
    const url = new URL(href);
    const rota = url.hash.match(ROTA_DO_APP);
    return url.pathname + (rota ? rota[0] : '');
  } catch {
    return '';
  }
}

function descrever(valor: unknown): { message: string; stack: string | null } {
  if (valor instanceof Error) return { message: valor.message || valor.name, stack: valor.stack ?? null };
  if (typeof valor === 'string') return { message: valor, stack: null };
  try {
    return { message: JSON.stringify(valor) ?? String(valor), stack: null };
  } catch {
    return { message: String(valor), stack: null };
  }
}

export function createErrorReporter(opcoes: ReporterOptions) {
  const limite = opcoes.maxPerSession ?? 10;
  const jaEnviados = new Set<string>();

  function report(kind: ClientErrorKind, valor: unknown): void {
    try {
      if (jaEnviados.size >= limite) return;
      const { message, stack } = descrever(valor);
      const chave = `${kind}|${message}`;
      if (jaEnviados.has(chave)) return;
      jaEnviados.add(chave);
      const resultado = opcoes.send({
        kind,
        message,
        stack,
        url: sanitizeUrl(opcoes.currentUrl()),
        release: opcoes.release,
        userAgent: opcoes.userAgent,
      });
      if (resultado instanceof Promise) resultado.catch(() => undefined);
    } catch {
      // Registrar erro nunca pode gerar erro novo.
    }
  }

  function install(alvo: EventTarget): () => void {
    const aoErro = (evento: Event) => {
      const erro = (evento as ErrorEvent).error;
      // Falha ao carregar <img>/<script> dispara `error` sem objeto de erro: não é bug de código.
      if (erro === undefined || erro === null) return;
      report('error', erro);
    };
    const aoRejeitar = (evento: Event) => report('unhandledrejection', (evento as PromiseRejectionEvent).reason);
    alvo.addEventListener('error', aoErro);
    alvo.addEventListener('unhandledrejection', aoRejeitar);
    return () => {
      alvo.removeEventListener('error', aoErro);
      alvo.removeEventListener('unhandledrejection', aoRejeitar);
    };
  }

  return { report, install };
}
