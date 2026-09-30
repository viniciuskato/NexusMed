import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { fetchAllRows } from './supabasePaging';

// 44-G: "Reportar erro" num material publicado (44-H2: também numa questão publicada,
// na mesma tabela e na mesma aba da Área Editorial). Acesso direto ao Supabase — sem o
// padrão "Resilient" (AGENTS.md, risco 8): o reporte não é gravado local nem entra
// em fila; ou o servidor o aceita, ou a tela diz que não foi enviado.
//
// Quem reportou NUNCA é enviado (o banco o define como auth.uid()) e o estado nasce
// "aberto". A RLS mostra a cada pessoa só os próprios reportes; admin lê todos e
// marca "resolvido" por uma função do banco. O limite de 20 por pessoa por dia é do
// banco (a tela só explica).

export const LIMITE_DE_REPORTES_POR_DIA = 20;
export const LIMITE_DO_TEXTO_DO_REPORTE = 2000;

export type EstadoDoReporte = 'aberto' | 'resolvido';

export interface NovoReporteDeErro {
  /** O alvo é um material OU uma questão: exatamente um dos dois. */
  materialId?: string;
  questionId?: string;
  /** O que está errado (obrigatório, até 2000 caracteres). */
  description: string;
  /** O trecho do material a que o erro se refere (opcional, até 2000 caracteres). */
  excerpt: string | null;
}

export interface ReporteDeErro {
  id: string;
  materialId: string | null;
  /** 44-H2: o reporte é de uma questão. */
  questionId: string | null;
  /** O nome do alvo: o título do material ou o começo do enunciado da questão. */
  materialTitle: string;
  description: string;
  excerpt: string | null;
  status: EstadoDoReporte;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: string; name: string; email: string } | null;
}

export interface MaterialErrorReportsRepository {
  report(input: NovoReporteDeErro): Promise<void>;
  /** Todos os reportes (só admin; para os demais a RLS devolve só os próprios). */
  listAll(): Promise<ReporteDeErro[]>;
  /** Marca como resolvido (só admin). */
  resolve(id: string): Promise<void>;
}

interface Row {
  id: string;
  material_id: string | null;
  question_id?: string | null;
  description: string;
  excerpt: string | null;
  status: EstadoDoReporte;
  created_at: string;
  resolved_at: string | null;
  reporter_id: string;
  material?: { title: string | null } | Array<{ title: string | null }> | null;
  question?: { question_stem: string | null } | Array<{ question_stem: string | null }> | null;
  reporter?:
    | { display_name: string | null; email: string | null }
    | Array<{ display_name: string | null; email: string | null }>
    | null;
}

const COLUMNS =
  'id, material_id, question_id, description, excerpt, status, created_at, resolved_at, reporter_id, ' +
  'material:materials(title), question:questions(question_stem), reporter:profiles!reporter_id(display_name, email)';

function fromRow(row: Row): ReporteDeErro {
  const material = Array.isArray(row.material) ? row.material[0] : row.material;
  const questao = Array.isArray(row.question) ? row.question[0] : row.question;
  const autor = Array.isArray(row.reporter) ? row.reporter[0] : row.reporter;
  const enunciado = (questao?.question_stem ?? '').replace(/\s+/g, ' ').trim();
  return {
    id: row.id,
    materialId: row.material_id,
    questionId: row.question_id ?? null,
    materialTitle: row.question_id
      ? `Questão: ${enunciado.length > 140 ? `${enunciado.slice(0, 140)}…` : enunciado || '(questão removida)'}`
      : (material?.title ?? '(material removido)'),
    description: row.description,
    excerpt: row.excerpt,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    reporter: autor ? { id: row.reporter_id, name: autor.display_name ?? '', email: autor.email ?? '' } : null,
  };
}

class SupabaseMaterialErrorReportsRepository implements MaterialErrorReportsRepository {
  async report(input: NovoReporteDeErro): Promise<void> {
    const { error } = await supabase.from('material_error_reports').insert({
      ...(input.questionId ? { question_id: input.questionId } : { material_id: input.materialId }),
      description: input.description,
      excerpt: input.excerpt,
    });
    if (error) throw error;
  }

  async listAll(): Promise<ReporteDeErro[]> {
    const rows = await fetchAllRows<Row>((from, to) =>
      supabase
        .from('material_error_reports')
        .select(`${COLUMNS}`)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    );
    return rows.map(fromRow);
  }

  async resolve(id: string): Promise<void> {
    const { error } = await supabase.rpc('resolver_erro_reportado', { p_report_id: id });
    if (error) throw error;
  }
}

// Sem Supabase configurado (modo local de demonstração) não há onde guardar o
// reporte: a tela avisa, em vez de fingir que enviou.
class UnavailableMaterialErrorReportsRepository implements MaterialErrorReportsRepository {
  async report(): Promise<void> {
    throw new Error('Reportar erro indisponível sem o servidor.');
  }
  async listAll(): Promise<ReporteDeErro[]> {
    return [];
  }
  async resolve(): Promise<void> {
    throw new Error('Marcar como resolvido indisponível sem o servidor.');
  }
}

export const reportarErroDisponivel = isSupabaseConfigured;

export const materialErrorReportsRepository: MaterialErrorReportsRepository = isSupabaseConfigured
  ? new SupabaseMaterialErrorReportsRepository()
  : new UnavailableMaterialErrorReportsRepository();

/** Frase leiga para o erro que o banco devolve ao gravar o reporte. */
export function mensagemDeErroDoReporte(err: unknown): string {
  const e = (err ?? {}) as { code?: string; message?: string; hint?: string; details?: string };
  const texto = `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}`;
  if (e.hint === 'limite_reportes_por_dia' || texto.includes('limite_reportes_por_dia')) {
    return `Você já enviou ${LIMITE_DE_REPORTES_POR_DIA} reportes de erro hoje. Tente de novo amanhã.`;
  }
  if (e.code === '42501') {
    return 'Este conteúdo já não está publicado, então não dá para reportar erro nele.';
  }
  if (e.code === '23514') {
    return `Escreva o que está errado, com no máximo ${LIMITE_DO_TEXTO_DO_REPORTE} caracteres (o trecho também tem esse limite).`;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Sem conexão. O reporte não foi enviado; tente de novo quando a rede voltar.';
  }
  return 'Não foi possível enviar o reporte agora. Tente de novo em instantes.';
}
