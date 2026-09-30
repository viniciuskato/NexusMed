import type { Compendium, LastReadingSession, Question, QuestionAnswerRecord } from '../types';
import { diaLocal } from '../utils/diaLocal';
import { LeituraDeMaterial, materiaisLidosHoje, questoesParaTestar } from './testarOQueLi';

// 43-E — regras da tela "Hoje". Só combina o que já existe: a leitura de hoje
// e as questões que a cobram (43-C), as respostas e a sessão de leitura. Nada
// de meta, estatística nem pontuação.

/** Onde o "Continuar lendo" retoma: o material e, se ainda existir, a seção. */
export interface RetomadaDeLeitura {
  compendiumId: string;
  compendiumTitle: string;
  sectionId?: string;
  sectionTitle?: string;
}

/** A resposta mais recente da questão foi dada hoje, no relógio do estudante. */
export function respondidaHoje(resposta: QuestionAnswerRecord | undefined, agora: Date = new Date()): boolean {
  if (!resposta) return false;
  const dia = diaLocal(resposta.timestamp);
  return dia !== '' && dia === diaLocal(agora);
}

/**
 * O "Testar o que li" do dia: os materiais lidos hoje (só os que o estudante
 * ainda vê) e, entre as questões que os cobram, as que ele ainda não respondeu
 * hoje. Sem sessão de teste gravada: "já testou" é ter respondido a questão
 * hoje, então responder tudo o que a leitura de hoje cobre zera o pendente.
 * Material lido que nenhuma questão cobra não gera pendência — não há o que
 * testar (o modal do 43-C ainda oferece "Resolver questões do tema").
 */
export function testePendenteHoje(entrada: {
  questions: Question[];
  leituras: LeituraDeMaterial[];
  answers: Record<string, QuestionAnswerRecord>;
  materiaisExistentes: Iterable<string>;
  agora?: Date;
}): { lidosHoje: string[]; pendentes: Question[] } {
  const agora = entrada.agora ?? new Date();
  const existentes = new Set(entrada.materiaisExistentes);
  const lidosHoje = materiaisLidosHoje(entrada.leituras, agora).filter((id) => existentes.has(id));
  const pendentes = questoesParaTestar(entrada.questions, lidosHoje).filter(
    (q) => !respondidaHoje(entrada.answers[q.id], agora)
  );
  return { lidosHoje, pendentes };
}

/**
 * Último material aberto, na seção onde parou. Vale só se o material ainda está
 * entre os que o estudante vê (despublicado ou removido não se abre) e usa os
 * títulos de agora; seção que sumiu abre o material do início.
 */
export function retomadaDeLeitura(
  sessao: LastReadingSession | null,
  compendiums: Compendium[]
): RetomadaDeLeitura | null {
  if (!sessao?.compendiumId) return null;
  const material = compendiums.find((c) => c.id === sessao.compendiumId);
  if (!material) return null;
  const secao = sessao.sectionId ? material.sections.find((s) => s.id === sessao.sectionId) : undefined;
  return {
    compendiumId: material.id,
    compendiumTitle: material.title,
    ...(secao ? { sectionId: secao.id, sectionTitle: secao.title } : {}),
  };
}
