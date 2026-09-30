import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { fetchAllRows } from './supabasePaging';

// 44-H1: envios de questões. Acesso direto ao Supabase — sem o padrão "Resilient"
// (AGENTS.md, risco 8): envio não é gravado local nem entra em fila; ou o
// servidor aceita, ou a tela diz que não foi enviado. Leitura só do servidor: a
// falha sobe para a tela, que avisa "sem conexão" (45-G, D-2).
//
// Irmão do repositório de envios de material (44-E). O autor NUNCA é enviado: o
// banco o define como auth.uid() (a coluna não tem privilégio de gravação para o
// cliente). O estado nasce "aguardando revisão". A RLS mostra a cada pessoa só
// os próprios envios.

export interface QuestionSubmission {
  /** Distingue o envio de questões do de material na lista "Meus envios". */
  kind: 'questoes';
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  materialIds: string[];
}

export interface NewQuestionSubmission {
  title: string;
  contentMd: string;
  materialIds: string[];
}

export interface QuestionSubmissionsRepository {
  /** Envios de questões da própria pessoa, do mais novo para o mais antigo. */
  listMine(): Promise<QuestionSubmission[]>;
  submit(input: NewQuestionSubmission): Promise<QuestionSubmission>;
}

interface Row {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  material_ids: string[] | null;
}

// Sem `content_md`: as listas não precisam do texto (até 300 KB por linha).
const COLUMNS = 'id, title, status, created_at, updated_at, material_ids';

function fromRow(row: Row): QuestionSubmission {
  return {
    kind: 'questoes',
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    materialIds: row.material_ids ?? [],
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
        .select(`${COLUMNS}`)
        .eq('author_id', uid)
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
}

// Sem Supabase configurado (modo local de demonstração) não há onde guardar o
// envio: a tela usa `envioDeMaterialDisponivel` para avisar.
class UnavailableQuestionSubmissionsRepository implements QuestionSubmissionsRepository {
  async listMine(): Promise<QuestionSubmission[]> {
    return [];
  }
  async submit(): Promise<QuestionSubmission> {
    throw new Error('Envio de questões indisponível sem o servidor.');
  }
}

export const questionSubmissionsRepository: QuestionSubmissionsRepository = isSupabaseConfigured
  ? new SupabaseQuestionSubmissionsRepository()
  : new UnavailableQuestionSubmissionsRepository();
