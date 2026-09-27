import type { Question } from '../types';
import { diaLocal } from '../utils/diaLocal';
import { questionMaterialIds } from '../utils/questionMaterials';

// 43-C — "Testar o que li". "Lido" é o progresso de leitura que já existe
// (seções marcadas como lidas, data da última leitura); "hoje" é o dia no
// relógio do estudante (`diaLocal`). Sem tabela de sessão: a escolha vive só
// no modal e vira o recorte da lista de questões.

/** Progresso de leitura de um material, com a data da última marcação. */
export interface LeituraDeMaterial {
  materialId: string;
  secoesLidas: number;
  /** ISO — `updated_at` do progresso, ou a hora em que a marcação ainda pendente foi feita. */
  ultimaLeitura: string;
}

/** Progresso como o servidor devolve: as seções lidas e a última marcação. */
export interface ProgressoLido {
  materialId: string;
  secaoIds: string[];
  ultimaLeitura: string;
}

/** Marcação de seção ainda na fila de sincronização (não chegou ao servidor). */
export interface MarcacaoPendente {
  materialId: string;
  sectionId: string;
  isRead: boolean;
  criadaEm: string;
}

// Datas comparadas como instantes: o texto ISO pode vir com fusos diferentes.
const instante = (iso: string) => Date.parse(iso) || 0;

/**
 * Ids dos materiais com alguma seção lida e última leitura hoje, do mais
 * recente para o mais antigo.
 */
export function materiaisLidosHoje(leituras: LeituraDeMaterial[], agora: Date = new Date()): string[] {
  const hoje = diaLocal(agora);
  return leituras
    .filter((l) => l.secoesLidas > 0 && diaLocal(l.ultimaLeitura) === hoje)
    .sort((x, y) => instante(y.ultimaLeitura) - instante(x.ultimaLeitura))
    .map((l) => l.materialId);
}

/**
 * Aplica ao que o servidor devolveu as marcações que ainda estão na fila, seção
 * a seção e na ordem em que foram feitas: quem acabou de ler não fica de fora
 * porque a gravação não subiu, e quem desmarcou a única seção lida sai.
 * Material que só aparece em desmarcações não entra.
 */
export function juntarLeiturasPendentes(progresso: ProgressoLido[], pendentes: MarcacaoPendente[]): LeituraDeMaterial[] {
  const porMaterial = new Map(
    progresso.map((p) => [p.materialId, { secoes: new Set(p.secaoIds), ultimaLeitura: p.ultimaLeitura }])
  );
  const emOrdem = [...pendentes].sort((x, y) => instante(x.criadaEm) - instante(y.criadaEm));
  for (const p of emOrdem) {
    let atual = porMaterial.get(p.materialId);
    if (!atual) {
      if (!p.isRead) continue;
      atual = { secoes: new Set(), ultimaLeitura: p.criadaEm };
      porMaterial.set(p.materialId, atual);
    }
    if (p.isRead) atual.secoes.add(p.sectionId);
    else atual.secoes.delete(p.sectionId);
    if (instante(p.criadaEm) > instante(atual.ultimaLeitura)) atual.ultimaLeitura = p.criadaEm;
  }
  return [...porMaterial.entries()].map(([materialId, m]) => ({
    materialId,
    secoesLidas: m.secoes.size,
    ultimaLeitura: m.ultimaLeitura,
  }));
}

/**
 * Questões que cobram os materiais marcados. Questão que cobra vários só entra
 * com todos marcados — é assim que as questões entre materiais aparecem quando
 * o estudante leu tudo o que elas exigem. Questão sem vínculo nunca entra.
 */
export function questoesParaTestar(questions: Question[], marcados: Iterable<string>): Question[] {
  const set = new Set(marcados);
  if (set.size === 0) return [];
  return questions.filter((q) => {
    const ids = questionMaterialIds(q);
    return ids.length > 0 && ids.every((id) => set.has(id));
  });
}
