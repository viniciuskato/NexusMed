import type { CompendiumSection, CompendiumSectionSnapshot } from '../../types';
import type { CamposDaSecao } from './mudancasDaSecao';

// O que o admin acabou de salvar numa seção, guardado só para a tela de leitura mostrar o texto novo (ED-2).
//
// O material que o leitor recebe vem da lista carregada pelo app (`compendiums`), e esta tela não tem como recarregá-la.
// Sem isto, a seção salva voltaria à leitura com o texto antigo, e ao sair e voltar ao material (a lista continua velha
// até recarregar a página) o texto antigo apareceria de novo. Cada edição lembra o texto da lista com que foi feita
// ("base"); se a lista mudar (foi recarregada), a edição é esquecida, porque a lista nova já traz o que vale.

interface Edicao {
  base: CamposDaSecao;
  salvo: Partial<CompendiumSectionSnapshot>;
}

const edicoes = new Map<string, Edicao>();

const camposDe = (s: CompendiumSection): CamposDaSecao => ({
  title: s.title,
  content: s.content,
  keyTakeaways: s.keyTakeaways,
  clinicalPearl: s.clinicalPearl,
  warningAlert: s.warningAlert,
});

const mesmosCampos = (a: CamposDaSecao, b: CamposDaSecao) =>
  a.title === b.title &&
  a.content === b.content &&
  (a.clinicalPearl ?? '') === (b.clinicalPearl ?? '') &&
  (a.warningAlert ?? '') === (b.warningAlert ?? '') &&
  JSON.stringify(a.keyTakeaways) === JSON.stringify(b.keyTakeaways);

/** Registra o que foi salvo; `secaoDaLista` é a seção como veio da lista (não a já editada). */
export function lembrarEdicao(secaoDaLista: CompendiumSection, salvo: Partial<CompendiumSectionSnapshot>): void {
  const anterior = edicoes.get(secaoDaLista.id);
  const base = anterior && mesmosCampos(anterior.base, camposDe(secaoDaLista)) ? anterior.base : camposDe(secaoDaLista);
  edicoes.set(secaoDaLista.id, { base, salvo: { ...(anterior && base === anterior.base ? anterior.salvo : {}), ...salvo } });
}

/** A seção com a edição salva por cima, se a lista ainda é a mesma com que ela foi feita. */
export function secaoComEdicao(secaoDaLista: CompendiumSection): CompendiumSection {
  const edicao = edicoes.get(secaoDaLista.id);
  if (!edicao) return secaoDaLista;
  if (!mesmosCampos(edicao.base, camposDe(secaoDaLista))) {
    edicoes.delete(secaoDaLista.id);
    return secaoDaLista;
  }
  return { ...secaoDaLista, ...edicao.salvo };
}

/** Esquece tudo (testes). */
export function esquecerEdicoesSalvas(): void {
  edicoes.clear();
}
