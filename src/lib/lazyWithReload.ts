import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// NOVO-01 — cada tela carregada com `lazy()` é um arquivo com hash no nome.
// Um deploy troca esses nomes; quem está com o app aberto e troca de tela
// pede um arquivo que não existe mais. Nesse caso recarregamos a página uma
// vez (o HTML novo aponta para os arquivos novos e o `#/tela` da URL reabre a
// tela pedida). Se falhar de novo logo em seguida, o erro sobe para o
// `AppErrorBoundary`, que mostra um aviso — nunca um laço de recargas.

const CHAVE_RECARGA = 'nexusmed:recarga-por-falha-de-carregamento';
const JANELA_SEM_NOVA_RECARGA_MS = 60_000;

function recarregouAgora(): boolean {
  try {
    const marca = Number(sessionStorage.getItem(CHAVE_RECARGA));
    return Number.isFinite(marca) && Date.now() - marca < JANELA_SEM_NOVA_RECARGA_MS;
  } catch {
    // sessionStorage indisponível: sem como evitar laço, então não recarrega.
    return true;
  }
}

function marcarRecarga(): void {
  try {
    sessionStorage.setItem(CHAVE_RECARGA, String(Date.now()));
  } catch {
    // Ignorado de propósito: `recarregouAgora` já trata o storage indisponível.
  }
}

function limparMarca(): void {
  try {
    sessionStorage.removeItem(CHAVE_RECARGA);
  } catch {
    // Nada a limpar se o storage está indisponível.
  }
}

// Mesma assinatura de `React.lazy`, que também usa `ComponentType<any>`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends ComponentType<any>>(
  importar: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const modulo = await importar();
      limparMarca();
      return modulo;
    } catch (erro) {
      if (recarregouAgora()) throw erro;
      marcarRecarga();
      window.location.reload();
      // Segura o Suspense no "Carregando…" até a recarga acontecer.
      return new Promise<never>(() => {});
    }
  });
}
