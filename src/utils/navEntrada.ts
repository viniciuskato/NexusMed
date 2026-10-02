import { diaLocal } from './diaLocal';

// 43-E — entrada na sessão do navegador. A tela "Hoje" é a porta de entrada, mas
// a restauração da última tela (22-A) existe para o reload: quem recarrega a
// página no meio do estudo volta onde estava. `sessionStorage` separa os dois
// casos sem tabela nem servidor — sobrevive ao reload da aba e some quando a
// aba é fechada. Guarda o id de quem já entrou nesta aba, então outra conta na
// mesma aba também entra por "Hoje".
//
// A marca guarda também o dia local da entrada: no celular a aba sobrevive por
// dias, e quem volta no dia seguinte está abrindo o app de novo, não
// recarregando — entra por "Hoje". Reload no mesmo dia continua restaurando.

export const NAV_ENTRADA_KEY = 'nexusmed_nav_entrada';

interface MarcaDeEntrada {
  userId: string;
  dia: string;
}

/** Este usuário já entrou no app nesta aba, hoje (a página foi recarregada, não aberta agora). */
export function jaEntrouNestaAba(userId: string, agora: Date = new Date()): boolean {
  try {
    const bruto = window.sessionStorage.getItem(NAV_ENTRADA_KEY);
    if (!bruto) return false;
    const marca = JSON.parse(bruto) as Partial<MarcaDeEntrada> | null;
    return marca?.userId === userId && marca.dia === diaLocal(agora);
  } catch {
    // Sem sessionStorage (janela privada, acesso bloqueado) ou marca ilegível: toda abertura é entrada nova.
    return false;
  }
}

export function marcarEntradaNestaAba(userId: string, agora: Date = new Date()): void {
  try {
    const marca: MarcaDeEntrada = { userId, dia: diaLocal(agora) };
    window.sessionStorage.setItem(NAV_ENTRADA_KEY, JSON.stringify(marca));
  } catch {
    // Só perde a distinção reload × abertura nova: a tela salva não é restaurada.
  }
}
