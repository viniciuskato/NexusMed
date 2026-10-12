import type { Compendium, Discipline, Question, QuestionAnswerRecord, QuestionAttemptSummary } from '../../types';

// PAINEL-1/PAINEL-2 — contas do Início. Só combina o que o app já calcula
// (respostas, progresso de leitura); nada é inventado nem tem dado de exemplo.
// Quem chama passa só questões de residência e as respostas a elas
// (`respostasDasQuestoes`, AGENTS.md item 24).

/** Percentual inteiro de `parte` sobre `total`: nunca 0% com algo feito, nunca 100% com algo faltando. */
function percentualDe(parte: number, total: number): number {
  if (total <= 0 || parte <= 0) return 0;
  if (parte >= total) return 100;
  return Math.min(99, Math.max(1, Math.round((parte / total) * 100)));
}

// ── Leitura ────────────────────────────────────────────────────────────────

export type EstadoDeLeitura = 'nao-comecei' | 'lendo' | 'lido';

export interface LeituraDoMaterial {
  compendiumId: string;
  titulo: string;
  disciplineId: string;
  /** Seções marcadas como lidas que ainda existem no material. */
  lidas: number;
  total: number;
  percentual: number;
  estado: EstadoDeLeitura;
}

export interface LeituraDaDisciplina {
  disciplineId: string;
  nome: string;
  lidas: number;
  total: number;
  percentual: number;
  materiais: LeituraDoMaterial[];
}

export interface MinhaLeitura {
  lidas: number;
  total: number;
  percentual: number;
  disciplinas: LeituraDaDisciplina[];
}

const OUTRAS_DISCIPLINAS = '__sem-disciplina__';

/**
 * O que o estudante já leu e o que falta: seções marcadas como lidas sobre o
 * total de seções dos materiais publicados (rascunho e arquivado não contam;
 * sem a informação de publicação, vale como publicado). Seção marcada que o
 * material não tem mais não conta. Material sem seção não entra (não há o que
 * ler). Disciplinas na ordem recebida; material de disciplina desconhecida
 * fica num grupo "Outros materiais" no fim, para a soma fechar.
 */
export function minhaLeitura(
  disciplines: Discipline[],
  compendiums: Compendium[],
  readingProgress: Record<string, { readSectionIds: string[]; percent: number }>
): MinhaLeitura {
  const nomes = new Map(disciplines.map((d) => [d.id, d.name]));
  const grupos = new Map<string, LeituraDoMaterial[]>();

  for (const material of compendiums) {
    if (material.publicationStatus && material.publicationStatus !== 'published') continue;
    const total = material.sections.length;
    if (total === 0) continue;
    const marcadas = new Set(readingProgress[material.id]?.readSectionIds ?? []);
    const lidas = material.sections.filter((s) => marcadas.has(s.id)).length;
    const disciplineId = nomes.has(material.disciplineId) ? material.disciplineId : OUTRAS_DISCIPLINAS;
    const item: LeituraDoMaterial = {
      compendiumId: material.id,
      titulo: material.title,
      disciplineId,
      lidas,
      total,
      percentual: percentualDe(lidas, total),
      estado: lidas === 0 ? 'nao-comecei' : lidas >= total ? 'lido' : 'lendo',
    };
    grupos.set(disciplineId, [...(grupos.get(disciplineId) ?? []), item]);
  }

  const montar = (disciplineId: string, nome: string): LeituraDaDisciplina | null => {
    const materiais = grupos.get(disciplineId);
    if (!materiais) return null;
    const lidas = materiais.reduce((soma, m) => soma + m.lidas, 0);
    const total = materiais.reduce((soma, m) => soma + m.total, 0);
    return { disciplineId, nome, lidas, total, percentual: percentualDe(lidas, total), materiais };
  };

  const disciplinas = [
    ...disciplines.map((d) => montar(d.id, d.name)),
    montar(OUTRAS_DISCIPLINAS, 'Outros materiais'),
  ].filter((d): d is LeituraDaDisciplina => d !== null);

  const lidas = disciplinas.reduce((soma, d) => soma + d.lidas, 0);
  const total = disciplinas.reduce((soma, d) => soma + d.total, 0);
  return { lidas, total, percentual: percentualDe(lidas, total), disciplinas };
}

// ── Questões de residência ─────────────────────────────────────────────────

export interface AcertoGeral {
  respondidas: number;
  certas: number;
  /** Percentual de acerto, arredondado; nulo sem nenhuma resposta (nunca "0%" inventado). */
  percentual: number | null;
}

export function acertoGeral(answers: Record<string, QuestionAnswerRecord>): AcertoGeral {
  const lista = Object.values(answers);
  const certas = lista.filter((a) => a.isCorrect).length;
  return {
    respondidas: lista.length,
    certas,
    percentual: lista.length > 0 ? Math.round((certas / lista.length) * 100) : null,
  };
}

export interface AcertoDeDisciplina {
  disciplineId: string;
  nome: string;
  /** Percentual de acerto, arredondado. */
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

export interface AcertoDeBanca {
  nome: string;
  respondidas: number;
  certas: number;
  percentual: number;
}

/**
 * Acertos por banca (instituição da questão): só as que têm resposta, da que
 * mais respondeu para a que menos. Empate: maior acerto e, depois, ordem alfabética.
 */
export function acertosPorBanca(
  questions: Question[],
  answers: Record<string, QuestionAnswerRecord>
): AcertoDeBanca[] {
  const bancaDaQuestao = new Map<string, string>();
  for (const q of questions) {
    const banca = (q.institution ?? '').trim();
    if (banca !== '') bancaDaQuestao.set(q.id, banca);
  }

  const contas = new Map<string, { respondidas: number; certas: number }>();
  for (const resposta of Object.values(answers)) {
    const banca = bancaDaQuestao.get(resposta.questionId);
    if (!banca) continue;
    const conta = contas.get(banca) ?? { respondidas: 0, certas: 0 };
    conta.respondidas += 1;
    if (resposta.isCorrect) conta.certas += 1;
    contas.set(banca, conta);
  }

  return Array.from(contas, ([nome, conta]) => ({
    nome,
    respondidas: conta.respondidas,
    certas: conta.certas,
    percentual: Math.round((conta.certas / conta.respondidas) * 100),
  })).sort(
    (a, b) => b.respondidas - a.respondidas || b.percentual - a.percentual || a.nome.localeCompare(b.nome, 'pt-BR')
  );
}

export interface SemanaDeAcerto {
  /** Segunda-feira da semana (AAAA-MM-DD, calendário local). */
  inicio: string;
  /** Segunda-feira da semana, "dd/mm". */
  rotulo: string;
  respondidas: number;
  certas: number;
  /** Nulo na semana sem resposta: aparece vazia, nunca como 0%. */
  percentual: number | null;
}

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/** Segunda-feira, 00h, do calendário local, da semana da data. */
function segundaDaSemana(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() - ((data.getDay() + 6) % 7));
}

function diaIso(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/**
 * Acerto por semana (segunda a domingo, relógio local) nas últimas `semanas`
 * semanas, a atual por último. Conta TODAS as tentativas, cada uma na semana em
 * que foi feita: errar na semana 1 e acertar na semana 3 dá 0% na primeira e
 * 100% na terceira (refazer um erro antigo não esvazia a semana passada).
 * Tentativa mais velha, no futuro ou com data inválida fica de fora.
 */
export function evolucaoSemanal(
  tentativas: QuestionAttemptSummary[],
  agora: Date = new Date(),
  semanas = 8
): SemanaDeAcerto[] {
  const segundaAtual = segundaDaSemana(agora);
  const lista: SemanaDeAcerto[] = [];
  for (let i = semanas - 1; i >= 0; i--) {
    const inicio = new Date(segundaAtual.getFullYear(), segundaAtual.getMonth(), segundaAtual.getDate() - 7 * i);
    lista.push({
      inicio: diaIso(inicio),
      rotulo: `${String(inicio.getDate()).padStart(2, '0')}/${String(inicio.getMonth() + 1).padStart(2, '0')}`,
      respondidas: 0,
      certas: 0,
      percentual: null,
    });
  }

  for (const resposta of tentativas) {
    const quando = new Date(resposta.timestamp);
    if (Number.isNaN(quando.getTime())) continue;
    // Semanas inteiras entre a segunda da resposta e a segunda de agora (o round absorve a troca de horário de verão).
    const atras = Math.round((segundaAtual.getTime() - segundaDaSemana(quando).getTime()) / (7 * DIA_EM_MS));
    if (atras < 0 || atras >= semanas) continue;
    const semana = lista[semanas - 1 - atras];
    semana.respondidas += 1;
    if (resposta.isCorrect) semana.certas += 1;
  }

  for (const semana of lista) {
    semana.percentual = semana.respondidas > 0 ? Math.round((semana.certas / semana.respondidas) * 100) : null;
  }
  return lista;
}
