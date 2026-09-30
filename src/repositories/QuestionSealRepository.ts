import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import type { SeloDeRevisao } from './MaterialSealRepository';

// 44-H2/44-H3: o selo de revisão das questões publicadas. A lista de questões tem centenas de
// cartões e nenhum deles faz consulta própria: os pedidos que chegam juntos viram UMA consulta
// (`selos_de_questoes`, só dos ids pedidos, até 500 por chamada). A API corta em 1000 linhas por
// consulta, então pedir "todos os selos" perderia os das questões além da milésima. O resultado
// de cada questão fica guardado por 2 minutos no módulo; uma falha não fica guardada.
//   'ia'           revisada pela IA, ainda não lida por uma pessoa;
//   'ia_e_pessoa'  revisada pela IA e atestada por uma pessoa;
//   null           questão antiga, ou alterada depois da revisão da IA: sem selo.

export interface QuestionSealsRepository {
  getSeal(questionId: string): Promise<SeloDeRevisao | null>;
}

export const VALIDADE_DO_SELO_MS = 2 * 60 * 1000;
export const IDS_POR_CONSULTA = 500;
/** Espera curta para juntar os cartões que se montam no mesmo instante numa consulta só. */
const JANELA_DE_AGRUPAMENTO_MS = 30;

interface Espera {
  resolve: (selo: SeloDeRevisao | null) => void;
  reject: (erro: unknown) => void;
}

class SupabaseQuestionSealsRepository implements QuestionSealsRepository {
  private guardados = new Map<string, { em: number; selo: SeloDeRevisao | null }>();
  private fila = new Map<string, Espera[]>();
  private agendado = false;

  getSeal(questionId: string): Promise<SeloDeRevisao | null> {
    const guardado = this.guardados.get(questionId);
    if (guardado && Date.now() - guardado.em < VALIDADE_DO_SELO_MS) return Promise.resolve(guardado.selo);
    return new Promise((resolve, reject) => {
      const esperas = this.fila.get(questionId) ?? [];
      esperas.push({ resolve, reject });
      this.fila.set(questionId, esperas);
      if (!this.agendado) {
        this.agendado = true;
        setTimeout(() => void this.descarregar(), JANELA_DE_AGRUPAMENTO_MS);
      }
    });
  }

  private async descarregar(): Promise<void> {
    const pedidos = this.fila;
    this.fila = new Map();
    this.agendado = false;
    const ids = [...pedidos.keys()];
    for (let i = 0; i < ids.length; i += IDS_POR_CONSULTA) {
      const lote = ids.slice(i, i + IDS_POR_CONSULTA);
      try {
        const { data, error } = await supabase.rpc('selos_de_questoes', { p_question_ids: lote });
        if (error) throw error;
        const selos = new Map<string, SeloDeRevisao>();
        for (const linha of (data ?? []) as Array<{ question_id: string; selo: string }>) {
          if (linha.selo === 'ia' || linha.selo === 'ia_e_pessoa') selos.set(linha.question_id, linha.selo);
        }
        const agora = Date.now();
        for (const id of lote) {
          const selo = selos.get(id) ?? null;
          this.guardados.set(id, { em: agora, selo });
          for (const espera of pedidos.get(id) ?? []) espera.resolve(selo);
        }
      } catch (erro) {
        for (const id of lote) for (const espera of pedidos.get(id) ?? []) espera.reject(erro);
      }
    }
  }
}

// Sem Supabase configurado (modo local de demonstração) não há revisão de IA.
class UnavailableQuestionSealsRepository implements QuestionSealsRepository {
  async getSeal(): Promise<SeloDeRevisao | null> {
    return null;
  }
}

export const questionSealsRepository: QuestionSealsRepository = isSupabaseConfigured
  ? new SupabaseQuestionSealsRepository()
  : new UnavailableQuestionSealsRepository();
