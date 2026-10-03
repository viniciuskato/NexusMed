import type { Compendium, Question } from '../types';
import type { MaterialParaPublicar } from './envioDeMaterial';

// ============================================================================
// Atualizar um material publicado a partir de arquivo (44-B) — a prévia
//
// O servidor casa as seções do arquivo com as do material pelo TÍTULO normalizado (sem
// acento, sem maiúscula, espaços colapsados; a k-ésima repetição casa com a k-ésima) e as
// referências pelo texto idêntico. Este módulo faz a mesma conta na tela, só para mostrar,
// ANTES de enviar, o que vai mudar: seções novas, alteradas e removidas, referências novas
// e removidas, e quantas questões apontam para seções que vão sumir. O banco continua sendo
// a autoridade (é ele que aplica); a regra de casamento é a de
// `supabase/migrations/20261003120500_atualizar_material_pelo_veredito_44b.sql`.
// ============================================================================

export function tituloNormalizado(titulo: string): string {
  return titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const vazioSeNulo = (s: string | null | undefined): string => (s ?? '').trim();
const listaIgual = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export interface MudancaDeCampo {
  campo: string;
  de: string;
  para: string;
}

export interface PreviaDaAtualizacao {
  /** O arquivo, aplicado, não muda nada: não vale a pena enviar. */
  identico: boolean;
  campos: MudancaDeCampo[];
  secoes: {
    novas: string[];
    alteradas: string[];
    removidas: string[];
    iguais: number;
    /** A ordem das seções que continuam mudou. */
    reordenadas: boolean;
  };
  referencias: { novas: string[]; removidas: string[]; ordemMudou: boolean };
  /** Questões ligadas a seções que vão sumir (a ligação com o material continua; a com a seção some). */
  questoesEmSecoesQueSomem: number;
}

type SecaoDoArquivo = MaterialParaPublicar['sections'][number];
type SecaoDoMaterial = Compendium['sections'][number];

function secaoIgual(publicada: SecaoDoMaterial, arquivo: SecaoDoArquivo): boolean {
  return (
    publicada.title.trim() === arquivo.title.trim() &&
    vazioSeNulo(publicada.mechanismTag) === vazioSeNulo(arquivo.mechanism_tag) &&
    publicada.content === arquivo.content &&
    listaIgual(publicada.keyTakeaways ?? [], arquivo.key_takeaways) &&
    vazioSeNulo(publicada.clinicalPearl) === vazioSeNulo(arquivo.clinical_pearl) &&
    vazioSeNulo(publicada.warningAlert) === vazioSeNulo(arquivo.warning_alert)
  );
}

export function compararComPublicado(
  publicado: Pick<Compendium, 'title' | 'subtitle' | 'author' | 'estimatedReadTimeMinutes' | 'tags' | 'sections' | 'references'>,
  arquivo: MaterialParaPublicar,
  /** As questões (só as ligadas ao material contam): para avisar das que perdem a seção. */
  questoes: Array<Pick<Question, 'compendiumSectionId' | 'materialLinks'>> = [],
): PreviaDaAtualizacao {
  // Casamento de seções: por título normalizado, na ordem.
  const usadas = new Set<number>();
  const casadas: Array<number | null> = arquivo.sections.map((s) => {
    const alvo = tituloNormalizado(s.title);
    for (let j = 0; j < publicado.sections.length; j += 1) {
      if (!usadas.has(j) && tituloNormalizado(publicado.sections[j].title) === alvo) {
        usadas.add(j);
        return j;
      }
    }
    return null;
  });

  const novas: string[] = [];
  const alteradas: string[] = [];
  let iguais = 0;
  casadas.forEach((j, k) => {
    const doArquivo = arquivo.sections[k];
    if (j === null) novas.push(doArquivo.title);
    else if (secaoIgual(publicado.sections[j], doArquivo)) iguais += 1;
    else alteradas.push(doArquivo.title);
  });
  const removidasIdx = publicado.sections.map((_, j) => j).filter((j) => !usadas.has(j));
  const removidas = removidasIdx.map((j) => publicado.sections[j].title);
  const ordemDasCasadas = casadas.filter((j): j is number => j !== null);
  const reordenadas = ordemDasCasadas.some((j, i) => i > 0 && j < ordemDasCasadas[i - 1]);

  // Referências: texto idêntico (repetição por repetição).
  const restantes = publicado.references.map((r) => r.trim());
  const refsNovas: string[] = [];
  const refsCasadas: number[] = [];
  for (const r of arquivo.references.map((x) => x.trim())) {
    const i = restantes.findIndex((x, idx) => x === r && !refsCasadas.includes(idx));
    if (i === -1) refsNovas.push(r);
    else refsCasadas.push(i);
  }
  const refsRemovidas = restantes.filter((_, idx) => !refsCasadas.includes(idx));
  const ordemDasRefs = refsCasadas.some((j, i) => i > 0 && j < refsCasadas[i - 1]);

  // Campos do material.
  const campos: MudancaDeCampo[] = [];
  const compara = (campo: string, de: string, para: string) => {
    if (de !== para) campos.push({ campo, de, para });
  };
  compara('Título', publicado.title.trim(), arquivo.title.trim());
  compara('Subtítulo', vazioSeNulo(publicado.subtitle), vazioSeNulo(arquivo.subtitle));
  compara('Autor', vazioSeNulo(publicado.author), vazioSeNulo(arquivo.author));
  compara(
    'Tempo de leitura',
    publicado.estimatedReadTimeMinutes ? String(publicado.estimatedReadTimeMinutes) : '',
    arquivo.estimated_read_time_minutes ? String(arquivo.estimated_read_time_minutes) : '',
  );
  const tagsDoMaterial = publicado.tags ?? [];
  // Arquivo sem palavras-chave vira "Geral" na importação: para material sem palavras-chave, não é mudança.
  const tagsIguais =
    listaIgual(tagsDoMaterial, arquivo.tags) || (tagsDoMaterial.length === 0 && listaIgual(arquivo.tags, ['Geral']));
  if (!tagsIguais) campos.push({ campo: 'Palavras-chave', de: tagsDoMaterial.join(', '), para: arquivo.tags.join(', ') });

  const idsQueSomem = new Set(removidasIdx.map((j) => publicado.sections[j].id));
  const questoesEmSecoesQueSomem = questoes.filter(
    (q) =>
      (q.compendiumSectionId && idsQueSomem.has(q.compendiumSectionId)) ||
      (q.materialLinks ?? []).some((l) => l.sectionId && idsQueSomem.has(l.sectionId)),
  ).length;

  const identico =
    campos.length === 0 &&
    novas.length === 0 &&
    alteradas.length === 0 &&
    removidas.length === 0 &&
    !reordenadas &&
    refsNovas.length === 0 &&
    refsRemovidas.length === 0 &&
    !ordemDasRefs;

  return {
    identico,
    campos,
    secoes: { novas, alteradas, removidas, iguais, reordenadas },
    referencias: { novas: refsNovas, removidas: refsRemovidas, ordemMudou: ordemDasRefs },
    questoesEmSecoesQueSomem,
  };
}
