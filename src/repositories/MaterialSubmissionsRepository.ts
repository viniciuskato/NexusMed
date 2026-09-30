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

export interface MaterialSubmission {
  id: string;
  title: string;
  disciplineId: string;
  themeId: string;
  parentMaterialId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
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

export interface MaterialSubmissionsRepository {
  /** Envios da própria pessoa, do mais novo para o mais antigo. */
  listMine(): Promise<MaterialSubmission[]>;
  /** Todos os envios (só admin; para os demais a RLS devolve só os próprios). */
  listAll(): Promise<MaterialSubmission[]>;
  submit(input: NewMaterialSubmission): Promise<MaterialSubmission>;
}

interface AuthorRow {
  display_name: string | null;
  email: string | null;
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
  // A junção com `profiles` é um-para-um; o tipo inferido a trata como lista.
  author?: AuthorRow | AuthorRow[] | null;
  author_id?: string;
}

// Sem `content_md`: as listas não precisam do texto (até 300 KB por linha).
const COLUMNS = 'id, title, discipline_id, theme_id, parent_material_id, status, created_at, updated_at';

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
    author: autor
      ? { id: row.author_id ?? '', name: autor.display_name ?? '', email: autor.email ?? '' }
      : undefined,
  };
}

class SupabaseMaterialSubmissionsRepository implements MaterialSubmissionsRepository {
  async listMine(): Promise<MaterialSubmission[]> {
    const { data: sessao } = await supabase.auth.getSession();
    const uid = sessao.session?.user?.id;
    if (!uid) return [];
    const rows = await fetchAllRows<Row>((from, to) =>
      supabase
        .from('material_submissions')
        .select(COLUMNS)
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
        .select(`${COLUMNS}, author_id, author:profiles!author_id(display_name, email)`)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    );
    return rows.map(fromRow);
  }

  async submit(input: NewMaterialSubmission): Promise<MaterialSubmission> {
    const { data, error } = await supabase
      .from('material_submissions')
      .insert({
        title: input.title,
        discipline_id: input.disciplineId,
        theme_id: input.themeId,
        parent_material_id: input.parentMaterialId,
        content_md: input.contentMd,
      })
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return fromRow(data as Row);
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
}

export const envioDeMaterialDisponivel = isSupabaseConfigured;

export const materialSubmissionsRepository: MaterialSubmissionsRepository = isSupabaseConfigured
  ? new SupabaseMaterialSubmissionsRepository()
  : new UnavailableMaterialSubmissionsRepository();
