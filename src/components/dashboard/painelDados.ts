import type { Compendium, Discipline, Flashcard, LastReadingSession, Question, QuestionAnswerRecord } from '../../types';
import { isCardDueToday } from '../../services/srsAlgorithm';

// PAINEL-1 — contas do painel enxuto e do "Meu desempenho". Só combina o que o
// app já calcula (cartões vencidos, respostas, progresso de leitura); nada é
// inventado nem tem dado de exemplo.

export interface AcertoDeDisciplina {
  disciplineId: string;
  nome: string;
  /** Percentual de acerto, arredondado (a mesma conta do "Meu desempenho"). */
  percentual: number;
  respondidas: number;
}

/**
 * Acertos por disciplina: só as que têm questão respondida, da menor para a
 * maior taxa (a que mais precisa de atenção vem primeiro). Empate: mais
 * respondidas primeiro e, depois, ordem alfabética.
 */
export function acertosPorDisciplina(
  disciplines: Discipline[],
  questions: Question[],
  answers: Record<string, QuestionAnswerRecord>
): AcertoDeDisciplina[] {
  const disciplinaDaQuestao = new Map<string, string>();
  for (const q of questions) disciplinaDaQuestao.set(q.id, q.disciplineId);

  const contas = new Map<string, { respondidas: number; certas: number }>();
  for (const resposta of Object.values(answers)) {
    const disciplineId = disciplinaDaQuestao.get(resposta.questionId);
    if (!disciplineId) continue;
    const conta = contas.get(disciplineId) ?? { respondidas: 0, certas: 0 };
    conta.respondidas += 1;
    if (resposta.isCorrect) conta.certas += 1;
    contas.set(disciplineId, conta);
  }

  const lista: AcertoDeDisciplina[] = [];
  for (const disc of disciplines) {
    const conta = contas.get(disc.id);
    if (!conta || conta.respondidas === 0) continue;
    lista.push({
      disciplineId: disc.id,
      nome: disc.name,
      percentual: Math.round((conta.certas / conta.respondidas) * 100),
      respondidas: conta.respondidas,
    });
  }
  return lista.sort(
    (a, b) => a.percentual - b.percentual || b.respondidas - a.respondidas || a.nome.localeCompare(b.nome, 'pt-BR')
  );
}

export interface MaterialEmAndamento {
  compendiumId: string;
  titulo: string;
  percentual: number;
  /** Seção onde o estudante parou, se este é o material da última sessão de leitura e a seção ainda existe. */
  sectionId?: string;
}

/**
 * Materiais com leitura iniciada e não concluída (progresso entre 0 e 100,
 * exclusive), no máximo `limite`. O da última sessão de leitura vem primeiro,
 * já na seção onde parou; os demais, do mais adiantado para o menos.
 */
export function materiaisEmAndamento(
  compendiums: Compendium[],
  readingProgress: Record<string, { readSectionIds: string[]; percent: number }>,
  sessao: LastReadingSession | null,
  limite = 3
): MaterialEmAndamento[] {
  const lista: MaterialEmAndamento[] = [];
  for (const material of compendiums) {
    const progresso = readingProgress[material.id];
    if (!progresso || !(progresso.percent > 0 && progresso.percent < 100)) continue;
    const secaoDaSessao =
      sessao?.compendiumId === material.id && sessao.sectionId && material.sections.some((s) => s.id === sessao.sectionId)
        ? sessao.sectionId
        : undefined;
    lista.push({
      compendiumId: material.id,
      titulo: material.title,
      percentual: Math.round(progresso.percent),
      ...(secaoDaSessao ? { sectionId: secaoDaSessao } : {}),
    });
  }
  return lista
    .sort((a, b) => {
      const aAtivo = sessao?.compendiumId === a.compendiumId;
      const bAtivo = sessao?.compendiumId === b.compendiumId;
      if (aAtivo !== bAtivo) return aAtivo ? -1 : 1;
      return b.percentual - a.percentual || a.titulo.localeCompare(b.titulo, 'pt-BR');
    })
    .slice(0, limite);
}

/** Cartões que vencem hoje (a mesma regra da revisão). */
export function cartoesParaHoje(flashcards: Flashcard[], agora: Date = new Date()): Flashcard[] {
  return flashcards.filter((fc) => isCardDueToday(fc, agora));
}

export interface ResumoDoBaralho {
  total: number;
  due: number;
  reviewedToday: number;
  /** Cartões nascidos de um erro. Cartão escrito pelo usuário não conta, mesmo com questão de origem. */
  errorLinked: number;
  mastered: number;
  inProgress: number;
}

export function resumoDoBaralho(flashcards: Flashcard[], due: number, reviewedToday: number): ResumoDoBaralho {
  const total = flashcards.length;
  const errorLinked = flashcards.filter(
    (fc) => (Boolean(fc.questionOriginId) && !fc.isWritten) || fc.id.startsWith('err-') || fc.tags?.includes('erro')
  ).length;
  const mastered = flashcards.filter((fc) => (fc.srs?.intervalDays ?? 0) >= 21).length;
  return { total, due, reviewedToday, errorLinked, mastered, inProgress: total - mastered };
}
