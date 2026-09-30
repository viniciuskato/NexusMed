// 43-E — entrada na sessão do navegador. A tela "Hoje" é a porta de entrada, mas
// a restauração da última tela (22-A) existe para o reload: quem recarrega a
// página no meio do estudo volta onde estava. `sessionStorage` separa os dois
// casos sem tabela nem servidor — sobrevive ao reload da aba e some quando a
// aba é fechada. Guarda o id de quem já entrou nesta aba, então outra conta na
// mesma aba também entra por "Hoje".

export const NAV_ENTRADA_KEY = 'nexusmed_nav_entrada';

/** Este usuário já entrou no app nesta aba (a página foi recarregada, não aberta agora). */
export function jaEntrouNestaAba(userId: string): boolean {
  try {
    return window.sessionStorage.getItem(NAV_ENTRADA_KEY) === userId;
  } catch {
    // Sem sessionStorage (janela privada, acesso bloqueado): toda abertura é entrada nova.
    return false;
  }
}

export function marcarEntradaNestaAba(userId: string): void {
  try {
    window.sessionStorage.setItem(NAV_ENTRADA_KEY, userId);
  } catch {
    // Só perde a distinção reload × abertura nova: a tela salva não é restaurada.
  }
}
