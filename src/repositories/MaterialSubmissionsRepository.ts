import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { fetchAllRows } from './supabasePaging';

// 44-E: envios de material. Acesso direto ao Supabase — sem o padrão
// "Resilient" (AGENTS.md, risco 8): envio não é gravado local nem entra em
// fila; ou o servidor aceita, ou a tela diz que não foi enviado. Leitura só do
// servidor: a falha sobe para a tela, que avisa "sem conexão" (45-G, D-2).
//
// O autor NUNCA é enviado: o banco o define como auth.uid() (a coluna não tem
// privilégio de gravação para o cliente). O estado nasce "aguardando revisão".
// A RLS mostra a cada pessoa só os próprios envios; admin lê todos.
//
// 44-F: cada envio vem com a revisão de IA que vale para o TEXTO ATUAL dele
// (mesmo hash). Revisão de um texto que já foi substituído não aparece.
// Substituir o texto (ou tentar de novo) só mexe em colunas que o cliente pode
// gravar; a volta à fila é do banco.

export type VereditoDaRevisao = 'apto' | 'nao_apto' | 'erro';

export interface MaterialReviewView {
  id: string;
  verdict: VereditoDaRevisao;
  /** Os achados, em texto da IA (Markdown). Nunca HTML: quem exibe passa por SafeMarkdown. */
  findingsText: string | null;
  /** O bloco de correção, para devolver a quem escreveu o material. */
  correctionBlock: string | null;
  errorKind: string | null;
  completedAt: string | null;
}

export interface MaterialSubmission {
  id: string;
  title: string;
  disciplineId: string;
  themeId: string;
  parentMaterialId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  /** 44-G: o material que o servidor criou e publicou a partir deste envio (estado "publicado"). */
  publishedMaterialId?: string | null;
  /** 44-G: por que o servidor não publicou (título repetido etc.), em palavras leigas. */
  publicationNote?: string | null;
  /** A revisão de IA do texto atual, se já houve uma. */
  review?: MaterialReviewView | null;
  /** Só na leitura de admin. */
  author?: { id: string; name: string; email: string } | null;
}

export interface NewMaterialSubmission {
  title: string;
  disciplineId: string;
  themeId: string;
  parentMaterialId: string | null;
  contentMd: string;
}

/** Onde estão os limites de revisão da pessoa (44-F). */
export interface SituacaoDaRevisao {
  usadasHoje: number;
  limitePorDia: number;
  /** O teto mensal de revisões do site foi atingido: os envios esperam. */
  mesEsgotado: boolean;
}

export interface MaterialSubmissionsRepository {
  /** Envios da própria pessoa, do mais novo para o mais antigo. */
  listMine(): Promise<MaterialSubmission[]>;
  /** Todos os envios (só admin; para os demais a RLS devolve só os próprios). */
  listAll(): Promise<MaterialSubmission[]>;
  submit(input: NewMaterialSubmission): Promise<MaterialSubmission>;
  /** Substitui o texto de um envio "não apto" ou "erro" (o banco o devolve à fila). */
  replaceText(id: string, input: NewMaterialSubmission): Promise<MaterialSubmission>;
  /** Manda o mesmo texto de novo para revisão (envio "erro"). */
  retry(id: string, title: string): Promise<MaterialSubmission>;
  situacaoDaRevisao(): Promise<SituacaoDaRevisao | null>;
}

interface AuthorRow {
  display_name: string | null;
  email: string | null;
}

interface ReviewRow {
  id: string;
  status: string;
  verdict: VereditoDaRevisao | null;
  findings_text: string | null;
  correction_block: string | null;
  error_kind: string | null;
  content_sha256: string;
  completed_at: string | null;
  created_at: string;
}

interface Row {
  id: string;
  title: string;
  discipline_id: string;
  theme_id: string;
  parent_material_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  content_sha256?: string | null;
  published_material_id?: string | null;
  publication_note?: string | null;
  reviews?: ReviewRow[] | null;
  // A junção com `profiles` é um-para-um; o tipo inferido a trata como lista.
  author?: AuthorRow | AuthorRow[] | null;
  author_id?: string;
}

// Sem `content_md`: as listas não precisam do texto (até 300 KB por linha).
const COLUMNS =
  'id, title, discipline_id, theme_id, parent_material_id, status, created_at, updated_at, content_sha256, published_material_id, publication_note';
const REVIEW_COLUMNS =
  'reviews:material_reviews(id, status, verdict, findings_text, correction_block, error_kind, content_sha256, completed_at, created_at)';

/**
 * A revisão terminada mais recente que vale para o texto atual (mesmo hash) — e
 * só enquanto o envio NÃO está na fila. Depois de "Tentar de novo", o texto é o
 * mesmo (o hash bate com a revisão antiga), mas o envio voltou a esperar uma
 * revisão nova: mostrar a antiga ali daria um veredito que já não vale.
 */
export function revisaoQueValeParaOTexto(row: Pick<Row, 'content_sha256' | 'reviews' | 'status'>): MaterialReviewView | null {
  if (row.status === 'aguardando_revisao' || row.status === 'em_revisao') return null;
  if (!row.content_sha256) return null;
  const validas = (row.reviews ?? [])
    .filter((r) => r.content_sha256 === row.content_sha256 && r.verdict && (r.status === 'concluida' || r.status === 'erro'))
    .sort((a, b) => (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at));
  const r = validas[0];
  if (!r || !r.verdict) return null;
  return {
    id: r.id,
    verdict: r.verdict,
    findingsText: r.findings_text,
    correctionBlock: r.correction_block,
    errorKind: r.error_kind,
    completedAt: r.completed_at,
  };
}

function fromRow(row: Row): MaterialSubmission {
  const autor = Array.isArray(row.author) ? row.author[0] : row.author;
  return {
    id: row.id,
    title: row.title,
    disciplineId: row.discipline_id,
    themeId: row.theme_id,
    parentMaterialId: row.parent_material_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedMaterialId: row.published_material_id ?? null,
    publicationNote: row.publication_note ?? null,
    review: revisaoQueValeParaOTexto(row),
    author: autor
      ? { id: row.author_id ?? '', name: autor.display_name ?? '', email: autor.email ?? '' }
      : undefined,
  };
}

const DADOS_DO_ENVIO = (input: NewMaterialSubmission) => ({
  title: input.title,
  discipline_id: input.disciplineId,
  theme_id: input.themeId,
  parent_material_id: input.parentMaterialId,
  content_md: input.contentMd,
});

class SupabaseMaterialSubmissionsRepository implements MaterialSubmissionsRepository {
  async listMine(): Promise<MaterialSubmission[]> {
    const { data: sessao } = await supabase.auth.getSession();
    const uid = sessao.session?.user?.id;
    if (!uid) return [];
    const rows = await fetchAllRows<Row>((from, to) =>
      supabase
        .from('material_submissions')
        .select(`${COLUMNS}, ${REVIEW_COLUMNS}`)
        .eq('author_id', uid)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    );
    return rows.map(fromRow);
  }

  async listAll(): Promise<MaterialSubmission[]> {
    const rows = await fetchAllRows<Row>((from, to) =>
      supabase
        .from('material_submissions')
        .select(`${COLUMNS}, ${REVIEW_COLUMNS}, author_id, author:profiles!author_id(display_name, email)`)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    );
    return rows.map(fromRow);
  }

  async submit(input: NewMaterialSubmission): Promise<MaterialSubmission> {
    const { data, error } = await supabase
      .from('material_submissions')
      .insert(DADOS_DO_ENVIO(input))
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return fromRow(data as Row);
  }

  async replaceText(id: string, input: NewMaterialSubmission): Promise<MaterialSubmission> {
    const { data, error } = await supabase
      .from('material_submissions')
      .update(DADOS_DO_ENVIO(input))
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return fromRow(data as Row);
  }

  async retry(id: string, title: string): Promise<MaterialSubmission> {
    // Regravar o título como está é uma alteração como outra qualquer para o
    // banco, que devolve o envio à fila; o texto não passa pela rede de novo.
    const { data, error } = await supabase
      .from('material_submissions')
      .update({ title })
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return fromRow(data as Row);
  }

  async situacaoDaRevisao(): Promise<SituacaoDaRevisao | null> {
    const { data, error } = await supabase.rpc('situacao_da_revisao');
    if (error) throw error;
    const s = data as { usadas_hoje?: number; limite_por_dia?: number; mes_esgotado?: boolean } | null;
    if (!s) return null;
    return { usadasHoje: s.usadas_hoje ?? 0, limitePorDia: s.limite_por_dia ?? 0, mesEsgotado: Boolean(s.mes_esgotado) };
  }
}

// Sem Supabase configurado (modo local de demonstração) não há onde guardar o
// envio: a tela usa `disponivel` para avisar, em vez de fingir que enviou.
class UnavailableMaterialSubmissionsRepository implements MaterialSubmissionsRepository {
  async listMine(): Promise<MaterialSubmission[]> {
    return [];
  }
  async listAll(): Promise<MaterialSubmission[]> {
    return [];
  }
  async submit(): Promise<MaterialSubmission> {
    throw new Error('Envio de material indisponível sem o servidor.');
  }
  async replaceText(): Promise<MaterialSubmission> {
    throw new Error('Envio de material indisponível sem o servidor.');
  }
  async retry(): Promise<MaterialSubmission> {
    throw new Error('Envio de material indisponível sem o servidor.');
  }
  async situacaoDaRevisao(): Promise<SituacaoDaRevisao | null> {
    return null;
  }
}

export const envioDeMaterialDisponivel = isSupabaseConfigured;

export const materialSubmissionsRepository: MaterialSubmissionsRepository = isSupabaseConfigured
  ? new SupabaseMaterialSubmissionsRepository()
  : new UnavailableMaterialSubmissionsRepository();
