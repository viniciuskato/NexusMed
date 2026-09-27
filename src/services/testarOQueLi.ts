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

/** Marcação de seção ainda na fila de sincronização (não chegou ao servidor). */
export interface MarcacaoPendente {
  materialId: string;
  isRead: boolean;
  criadaEm: string;
}

/**
 * Ids dos materiais com alguma seção lida e última leitura hoje, do mais
 * recente para o mais antigo.
 */
export function materiaisLidosHoje(leituras: LeituraDeMaterial[], agora: Date = new Date()): string[] {
  const hoje = diaLocal(agora);
  return leituras
    .filter((l) => l.secoesLidas > 0 && diaLocal(l.ultimaLeitura) === hoje)
    .sort((x, y) => y.ultimaLeitura.localeCompare(x.ultimaLeitura))
    .map((l) => l.materialId);
}

/**
 * Soma ao que o servidor devolveu as seções marcadas como lidas que ainda
 * estão na fila: quem acabou de ler e abre o teste em seguida não pode ver o
 * material de fora só porque a gravação ainda não subiu.
 */
export function juntarLeiturasPendentes(leituras: LeituraDeMaterial[], pendentes: MarcacaoPendente[]): LeituraDeMaterial[] {
  const porMaterial = new Map(leituras.map((l) => [l.materialId, { ...l }]));
  for (const p of pendentes) {
    if (!p.isRead) continue;
    const atual = porMaterial.get(p.materialId);
    if (!atual) {
      porMaterial.set(p.materialId, { materialId: p.materialId, secoesLidas: 1, ultimaLeitura: p.criadaEm });
      continue;
    }
    atual.secoesLidas += 1;
    if (p.criadaEm > atual.ultimaLeitura) atual.ultimaLeitura = p.criadaEm;
  }
  return [...porMaterial.values()];
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
