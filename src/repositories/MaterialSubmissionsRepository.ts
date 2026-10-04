import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { fetchAllRows } from './supabasePaging';
import type { MaterialParaPublicar } from '../utils/envioDeMaterial';

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
  /** 44-B: o material publicado que este envio ATUALIZA (envio do tipo "atualização"); ausente nos envios de material novo. */
  targetMaterialId?: string | null;
  /** 44-B: quando o servidor aplicou a atualização. */
  appliedAt?: string | null;
  /** A revisão de IA do texto atual, se já houve uma. */
  review?: MaterialReviewView | null;
  /** Só na leitura de admin. */
  author?: { id: string; name: string; email: string } | null;
}

/** 44-B: pedido de atualização de um material publicado (o lugar vem do material, no banco). */
export interface NewMaterialUpdate {
  targetMaterialId: string;
  title: string;
  contentMd: string;
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

/** P8: o texto do envio e o hash dele, lidos juntos na hora de publicar (o banco recusa se o texto mudou no meio). */
export interface TextoDoEnvio {
  contentMd: string;
  contentSha256: string;
}

/**
 * P8: a resposta das funções que o admin chama para publicar um envio (`admin_publicar_envio`,
 * `admin_aplicar_atualizacao`, `admin_publicar_questoes`): publicado | aplicado | sem_mudanca | ja_publicado |
 * recusado (com `motivo`) | falhou | texto_mudou | texto_invalido | fora_de_estado (com `estado`).
 */
export interface ResultadoDaPublicacaoDoAdmin {
  resultado: string;
  motivo?: string;
  estado?: string;
  material_id?: string;
  question_ids?: string[];
}

export interface MaterialSubmissionsRepository {
  /** Envios da própria pessoa, do mais novo para o mais antigo. */
  listMine(): Promise<MaterialSubmission[]>;
  /** Todos os envios (só admin; para os demais a RLS devolve só os próprios). */
  listAll(): Promise<MaterialSubmission[]>;
  submit(input: NewMaterialSubmission): Promise<MaterialSubmission>;
  /** 44-B: pede a atualização de um material publicado a partir de um arquivo (passa pelo revisor de IA). */
  submitUpdate(input: NewMaterialUpdate): Promise<MaterialSubmission>;
  /** 44-B: a pessoa pode exportar e atualizar este material? (admin ativo, ou o autor do envio que o publicou; decide o banco) */
  podeAtualizar(materialId: string): Promise<boolean>;
  /** 44-B: as seções do material a que cada questão está ligada (uma entrada por questão ligada a uma seção), para a prévia. */
  secoesDasQuestoes(materialId: string): Promise<string[]>;
  /** Substitui o texto de um envio "não apto" ou "erro" (o banco o devolve à fila). */
  replaceText(id: string, input: NewMaterialSubmission): Promise<MaterialSubmission>;
  /** Manda o mesmo texto de novo para revisão (envio "erro"). */
  retry(id: string, title: string): Promise<MaterialSubmission>;
  situacaoDaRevisao(): Promise<SituacaoDaRevisao | null>;
  /** P8 (só admin): o texto do envio e o hash dele, para publicar. */
  textoParaPublicar(id: string): Promise<TextoDoEnvio>;
  /** P8 (só admin): cria o material do envio e o publica, com qualquer parecer do revisor. */
  publicarComoAdmin(id: string, contentSha256: string, material: MaterialParaPublicar): Promise<ResultadoDaPublicacaoDoAdmin>;
  /** P8 (só admin): troca o conteúdo do material publicado pelo do envio de atualização, com qualquer parecer do revisor. */
  aplicarAtualizacaoComoAdmin(id: string, contentSha256: string, material: MaterialParaPublicar): Promise<ResultadoDaPublicacaoDoAdmin>;
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
  /** O lugar que a IA recebeu junto com o texto (44-F). */
  discipline_id?: string | null;
  theme_id?: string | null;
  parent_material_id?: string | null;
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
  target_material_id?: string | null;
  applied_at?: string | null;
  reviews?: ReviewRow[] | null;
  // A junção com `profiles` é um-para-um; o tipo inferido a trata como lista.
  author?: AuthorRow | AuthorRow[] | null;
  author_id?: string;
}

// Sem `content_md`: as listas não precisam do texto (até 300 KB por linha).
const COLUMNS =
  'id, title, discipline_id, theme_id, parent_material_id, status, created_at, updated_at, content_sha256, published_material_id, publication_note, target_material_id, applied_at';
const REVIEW_COLUMNS =
  'reviews:material_reviews(id, status, verdict, findings_text, correction_block, error_kind, content_sha256, completed_at, created_at, discipline_id, theme_id, parent_material_id)';

/** A revisão foi feita para o lugar (Disciplina, Tema e material acima) que o envio tem agora? */
function mesmoLugarDoEnvio(
  r: ReviewRow,
  row: Pick<Row, 'discipline_id' | 'theme_id' | 'parent_material_id'>,
): boolean {
  return (
    (r.discipline_id ?? null) === (row.discipline_id ?? null) &&
    (r.theme_id ?? null) === (row.theme_id ?? null) &&
    (r.parent_material_id ?? null) === (row.parent_material_id ?? null)
  );
}

/**
 * A revisão que vale para o texto E o lugar atuais, e só enquanto o envio NÃO está na fila
 * (depois de "Tentar de novo", o texto é o mesmo, mas o envio voltou a esperar uma revisão
 * nova: mostrar a antiga daria um veredito que já não vale). Mesma regra do servidor
 * (44-H3): vale a revisão CONCLUÍDA mais recente do texto, em qualquer lugar — se ela é de
 * outro lugar, nenhuma vale; uma revisão de erro só aparece se for do lugar de agora.
 * Quando a linha não traz o lugar (as listas antigas), o lugar não é conferido.
 */
export function revisaoQueValeParaOTexto(
  row: Pick<Row, 'content_sha256' | 'reviews' | 'status'> & Partial<Pick<Row, 'discipline_id' | 'theme_id' | 'parent_material_id'>>,
): MaterialReviewView | null {
  if (row.status === 'aguardando_revisao' || row.status === 'em_revisao') return null;
  if (!row.content_sha256) return null;
  const temLugar = row.discipline_id !== undefined;
  const lugarOk = (r: ReviewRow) => !temLugar || mesmoLugarDoEnvio(r, row as Pick<Row, 'discipline_id' | 'theme_id' | 'parent_material_id'>);
  const maisRecenteDe = (lista: ReviewRow[]) =>
    [...lista].sort((a, b) => (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at))[0];
  const doTexto = (row.reviews ?? []).filter(
    (r) => r.content_sha256 === row.content_sha256 && r.verdict && (r.status === 'concluida' || r.status === 'erro'),
  );
  const concluida = maisRecenteDe(doTexto.filter((r) => r.status === 'concluida'));
  if (concluida && !lugarOk(concluida)) return null;
  const r = maisRecenteDe([...(concluida ? [concluida] : []), ...doTexto.filter((x) => x.status === 'erro' && lugarOk(x))]);
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
    targetMaterialId: row.target_material_id ?? null,
    appliedAt: row.applied_at ?? null,
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

  async submitUpdate(input: NewMaterialUpdate): Promise<MaterialSubmission> {
    // Sem Disciplina, Tema nem material acima: o banco os toma do material que se atualiza.
    const { data, error } = await supabase
      .from('material_submissions')
      .insert({ title: input.title, content_md: input.contentMd, target_material_id: input.targetMaterialId })
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return fromRow(data as Row);
  }

  async podeAtualizar(materialId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('pode_atualizar_material', { p_material: materialId });
    if (error) throw error;
    return data === true;
  }

  async secoesDasQuestoes(materialId: string): Promise<string[]> {
    const rows = await fetchAllRows<{ material_section_id: string | null }>((from, to) =>
      supabase
        .from('question_materials')
        .select('material_section_id')
        .eq('material_id', materialId)
        .not('material_section_id', 'is', null)
        .order('question_id')
        .range(from, to),
    );
    return rows.map((r) => r.material_section_id).filter((id): id is string => Boolean(id));
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

  async textoParaPublicar(id: string): Promise<TextoDoEnvio> {
    const { data, error } = await supabase.from('material_submissions').select('content_md, content_sha256').eq('id', id).single();
    if (error) throw error;
    const linha = data as { content_md: string; content_sha256: string };
    return { contentMd: linha.content_md, contentSha256: linha.content_sha256 };
  }

  async publicarComoAdmin(id: string, contentSha256: string, material: MaterialParaPublicar): Promise<ResultadoDaPublicacaoDoAdmin> {
    const { data, error } = await supabase.rpc('admin_publicar_envio', {
      p_submission_id: id,
      p_content_sha256: contentSha256,
      p_material: material,
    });
    if (error) throw error;
    return data as ResultadoDaPublicacaoDoAdmin;
  }

  async aplicarAtualizacaoComoAdmin(id: string, contentSha256: string, material: MaterialParaPublicar): Promise<ResultadoDaPublicacaoDoAdmin> {
    const { data, error } = await supabase.rpc('admin_aplicar_atualizacao', {
      p_submission_id: id,
      p_content_sha256: contentSha256,
      p_material: material,
    });
    if (error) throw error;
    return data as ResultadoDaPublicacaoDoAdmin;
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
  async submitUpdate(): Promise<MaterialSubmission> {
    throw new Error('Envio de material indisponível sem o servidor.');
  }
  async podeAtualizar(): Promise<boolean> {
    return false;
  }
  async secoesDasQuestoes(): Promise<string[]> {
    return [];
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
  async textoParaPublicar(): Promise<TextoDoEnvio> {
    throw new Error('Envio de material indisponível sem o servidor.');
  }
  async publicarComoAdmin(): Promise<ResultadoDaPublicacaoDoAdmin> {
    throw new Error('Envio de material indisponível sem o servidor.');
  }
  async aplicarAtualizacaoComoAdmin(): Promise<ResultadoDaPublicacaoDoAdmin> {
    throw new Error('Envio de material indisponível sem o servidor.');
  }
}

export const envioDeMaterialDisponivel = isSupabaseConfigured;

export const materialSubmissionsRepository: MaterialSubmissionsRepository = isSupabaseConfigured
  ? new SupabaseMaterialSubmissionsRepository()
  : new UnavailableMaterialSubmissionsRepository();
