import type { CompendiumSection, CompendiumSectionSnapshot } from '../../types';

// O que mudou numa seção editada na página de leitura (ED-2). Só entram no pedido de gravação os campos que mudaram
// (AGENTS.md, item 17: salvar sem mudança é no-op): a função que grava (`updateSectionContent`) compara com o que está
// no banco e só registra versão se algo mudou, mas quem chama não deve nem mandar o que ficou igual.

export type CamposDaSecao = Pick<CompendiumSection, 'title' | 'content' | 'keyTakeaways' | 'clinicalPearl' | 'warningAlert'>;

/** O que está nos campos agora (texto como digitado, ainda sem aparar). */
export interface ValoresEditados {
  titulo: string;
  conteudo: string;
  pontos: string[];
  perola: string;
  alerta: string;
}

export const valoresIniciais = (secao: CamposDaSecao): ValoresEditados => ({
  titulo: secao.title,
  conteudo: secao.content,
  pontos: [...secao.keyTakeaways],
  perola: secao.clinicalPearl ?? '',
  alerta: secao.warningAlert ?? '',
});

const mesmaLista = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Campo curto (título, Pérola, Alerta, pontos): o texto vale aparado, como o `SectionEditor` o grava. Sem mudança se
 * ficou como estava, com ou sem o aparo (espaço que já estava lá não conta como edição).
 */
function mudou(original: string, atual: string): { mudou: boolean; final: string } {
  const final = atual.trim();
  return { mudou: atual !== original && final !== original, final };
}

export function mudancasDaSecao(original: CamposDaSecao, v: ValoresEditados): Partial<CompendiumSectionSnapshot> {
  const patch: Partial<CompendiumSectionSnapshot> = {};

  const titulo = mudou(original.title, v.titulo);
  if (titulo.mudou) patch.title = titulo.final;

  // O texto da seção não é aparado: o que o editor devolve é o que se grava.
  if (v.conteudo !== original.content) patch.content = v.conteudo;

  // Pontos-chave: cada um vale aparado e ponto vazio some (como no `SectionEditor`); só muda se a lista final difere da de antes.
  const pontosFinais = v.pontos.map((p) => p.trim()).filter(Boolean);
  const pontosDoOriginal = original.keyTakeaways.map((p) => p.trim()).filter(Boolean);
  if (!mesmaLista(pontosFinais, pontosDoOriginal)) patch.keyTakeaways = pontosFinais;

  const perola = mudou(original.clinicalPearl ?? '', v.perola);
  if (perola.mudou) patch.clinicalPearl = perola.final || undefined;

  const alerta = mudou(original.warningAlert ?? '', v.alerta);
  if (alerta.mudou) patch.warningAlert = alerta.final || undefined;

  return patch;
}
