import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { fetchAllRows } from './supabasePaging';
import { revisaoQueValeParaOTexto, type MaterialReviewView } from './MaterialSubmissionsRepository';

// 44-H1: envios de questões. Acesso direto ao Supabase — sem o padrão "Resilient"
// (AGENTS.md, risco 8): envio não é gravado local nem entra em fila; ou o
// servidor aceita, ou a tela diz que não foi enviado. Leitura só do servidor: a
// falha sobe para a tela, que avisa "sem conexão" (45-G, D-2).
//
// Irmão do repositório de envios de material (44-E). O autor NUNCA é enviado: o
// banco o define como auth.uid() (a coluna não tem privilégio de gravação para o
// cliente). O estado nasce "aguardando revisão". A RLS mostra a cada pessoa só
// os próprios envios.
//
// 44-H2: cada envio vem com a revisão de IA que vale para o TEXTO ATUAL dele (a
// mesma tabela e a mesma regra do envio de material) e, publicado, com o
// vínculo às questões que o servidor criou. Substituir o texto, trocar os
// materiais ou tentar de novo só mexe em colunas que o cliente pode gravar; a
// volta à fila é do banco.

export interface QuestionSubmission {
  /** Distingue o envio de questões do de material na lista "Meus envios". */
  kind: 'questoes';
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  materialIds: string[];
  /** 44-H2: as questões que o servidor criou e publicou a partir deste envio (estado "publicado"). */
  publishedQuestionIds?: string[];
  /** 44-H2: por que o servidor não publicou (material ambíguo etc.), em palavras leigas. */
  publicationNote?: string | null;
  /** 44-H2: a revisão de IA do texto atual, se já houve uma. */
  review?: MaterialReviewView | null;
  /** Só na leitura de admin. */
  author?: { id: string; name: string; email: string } | null;
}

export interface NewQuestionSubmission {
  title: string;
  contentMd: string;
  materialIds: string[];
}

export interface QuestionSubmissionsRepository {
  /** Envios de questões da própria pessoa, do mais novo para o mais antigo. */
  listMine(): Promise<QuestionSubmission[]>;
  /** Todos os envios de questões (só admin; para os demais a RLS devolve só os próprios). */
  listAll(): Promise<QuestionSubmission[]>;
  submit(input: NewQuestionSubmission): Promise<QuestionSubmission>;
  /** Substitui o texto (e os materiais) de um envio "não apto" ou "erro": o banco o devolve à fila. */
  replaceText(id: string, input: NewQuestionSubmission): Promise<QuestionSubmission>;
  /** Manda o mesmo texto de novo (envio "erro"): com revisão "apto" do texto e dos materiais atuais, só a publicação é refeita. */
  retry(id: string, title: string): Promise<QuestionSubmission>;
}

interface AuthorRow {
  display_name: string | null;
  email: string | null;
}

interface ReviewRow {
  id: string;
  status: string;
  verdict: 'apto' | 'nao_apto' | 'erro' | null;
  findings_text: string | null;
  correction_block: string | null;
  error_kind: string | null;
  content_sha256: string;
  completed_at: string | null;
  created_at: string;
  /** Os materiais que a IA recebeu com o lote (gravados pelo banco na reserva). */
  material_ids: string[] | null;
}

interface Row {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  material_ids: string[] | null;
  content_sha256?: string | null;
  published_question_ids?: string[] | null;
  publication_note?: string | null;
  reviews?: ReviewRow[] | null;
  // A junção com `profiles` é um-para-um; o tipo inferido a trata como lista.
  author?: AuthorRow | AuthorRow[] | null;
  author_id?: string;
}

// Sem `content_md`: as listas não precisam do texto (até 300 KB por linha).
const COLUMNS =
  'id, title, status, created_at, updated_at, material_ids, content_sha256, published_question_ids, publication_note';
const REVIEW_COLUMNS =
  'reviews:material_reviews(id, status, verdict, findings_text, correction_block, error_kind, content_sha256, completed_at, created_at, material_ids)';

/** Os mesmos materiais, em qualquer ordem. */
function mesmoConjunto(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * A revisão que vale para o texto E os materiais atuais (44-H3): a mais recente daquele texto,
 * em qualquer conjunto de materiais, precisa ser a dos materiais de agora; senão nenhuma vale
 * (uma revisão antiga de outros materiais não pode aparecer como o veredito de hoje).
 */
export function revisaoQueValeParaOTextoEOsMateriais(row: {
  content_sha256?: string | null;
  status: string;
  material_ids: string[] | null;
  reviews?: ReviewRow[] | null;
}): MaterialReviewView | null {
  if (!row.content_sha256) return null;
  const daquelesTexto = (row.reviews ?? []).filter(
    (r) => r.content_sha256 === row.content_sha256 && r.verdict && (r.status === 'concluida' || r.status === 'erro'),
  );
  const maisRecente = [...daquelesTexto].sort((a, b) => (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at))[0];
  if (!maisRecente || !maisRecente.material_ids || !mesmoConjunto(maisRecente.material_ids, row.material_ids ?? [])) return null;
  return revisaoQueValeParaOTexto({ content_sha256: row.content_sha256, status: row.status, reviews: [maisRecente] });
}

function fromRow(row: Row): QuestionSubmission {
  const autor = Array.isArray(row.author) ? row.author[0] : row.author;
  return {
    kind: 'questoes',
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    materialIds: row.material_ids ?? [],
    publishedQuestionIds: row.published_question_ids ?? [],
    publicationNote: row.publication_note ?? null,
    review: revisaoQueValeParaOTextoEOsMateriais(row),
    author: autor ? { id: row.author_id ?? '', name: autor.display_name ?? '', email: autor.email ?? '' } : undefined,
  };
}

class SupabaseQuestionSubmissionsRepository implements QuestionSubmissionsRepository {
  async listMine(): Promise<QuestionSubmission[]> {
    const { data: sessao } = await supabase.auth.getSession();
    const uid = sessao.session?.user?.id;
    if (!uid) return [];
    const rows = await fetchAllRows<Row>((from, to) =>
      supabase
        .from('question_submissions')
        .select(`${COLUMNS}, ${REVIEW_COLUMNS}`)
        .eq('author_id', uid)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    );
    return rows.map(fromRow);
  }

  async listAll(): Promise<QuestionSubmission[]> {
    const rows = await fetchAllRows<Row>((from, to) =>
      supabase
        .from('question_submissions')
        .select(`${COLUMNS}, ${REVIEW_COLUMNS}, author_id, author:profiles!author_id(display_name, email)`)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    );
    return rows.map(fromRow);
  }

  async submit(input: NewQuestionSubmission): Promise<QuestionSubmission> {
    const { data, error } = await supabase
      .from('question_submissions')
      .insert({ title: input.title, content_md: input.contentMd, material_ids: input.materialIds })
      .select(`${COLUMNS}`)
      .single();
    if (error) throw error;
    return fromRow(data as Row);
  }

  async replaceText(id: string, input: NewQuestionSubmission): Promise<QuestionSubmission> {
    const { data, error } = await supabase
      .from('question_submissions')
      .update({ title: input.title, content_md: input.contentMd, material_ids: input.materialIds })
      .eq('id', id)
      .select(`${COLUMNS}`)
      .single();
    if (error) throw error;
    return fromRow(data as Row);
  }

  async retry(id: string, title: string): Promise<QuestionSubmission> {
    // Regravar o título como está é uma alteração como outra qualquer para o banco.
    const { data, error } = await supabase
      .from('question_submissions')
      .update({ title })
      .eq('id', id)
      .select(`${COLUMNS}`)
      .single();
    if (error) throw error;
    return fromRow(data as Row);
  }
}

// Sem Supabase configurado (modo local de demonstração) não há onde guardar o
// envio: a tela usa `envioDeMaterialDisponivel` para avisar.
class UnavailableQuestionSubmissionsRepository implements QuestionSubmissionsRepository {
  async listMine(): Promise<QuestionSubmission[]> {
    return [];
  }
  async listAll(): Promise<QuestionSubmission[]> {
    return [];
  }
  async submit(): Promise<QuestionSubmission> {
    throw new Error('Envio de questões indisponível sem o servidor.');
  }
  async replaceText(): Promise<QuestionSubmission> {
    throw new Error('Envio de questões indisponível sem o servidor.');
  }
  async retry(): Promise<QuestionSubmission> {
    throw new Error('Envio de questões indisponível sem o servidor.');
  }
}

export const questionSubmissionsRepository: QuestionSubmissionsRepository = isSupabaseConfigured
  ? new SupabaseQuestionSubmissionsRepository()
  : new UnavailableQuestionSubmissionsRepository();
