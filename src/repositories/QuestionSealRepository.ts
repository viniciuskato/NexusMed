import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import type { SeloDeRevisao } from './MaterialSealRepository';

// 44-H2: o selo de revisão das questões publicadas. Uma consulta traz o selo de TODAS
// as questões com revisão de IA válida (`selos_de_questoes`): a lista de questões tem
// centenas de cartões e nenhum deles faz consulta própria. O resultado fica guardado
// por 2 minutos no módulo; uma falha não fica guardada.
//   'ia'           revisada pela IA, ainda não lida por uma pessoa;
//   'ia_e_pessoa'  revisada pela IA e atestada por uma pessoa;
//   (ausente)      questão antiga, ou alterada depois da revisão da IA: sem selo.

export interface QuestionSealsRepository {
  getSeals(): Promise<Map<string, SeloDeRevisao>>;
}

const VALIDADE_MS = 2 * 60 * 1000;

class SupabaseQuestionSealsRepository implements QuestionSealsRepository {
  private guardado: { em: number; promessa: Promise<Map<string, SeloDeRevisao>> } | null = null;

  getSeals(): Promise<Map<string, SeloDeRevisao>> {
    const agora = Date.now();
    if (this.guardado && agora - this.guardado.em < VALIDADE_MS) return this.guardado.promessa;
    const promessa = (async () => {
      const { data, error } = await supabase.rpc('selos_de_questoes');
      if (error) throw error;
      const mapa = new Map<string, SeloDeRevisao>();
      for (const linha of (data ?? []) as Array<{ question_id: string; selo: string }>) {
        if (linha.selo === 'ia' || linha.selo === 'ia_e_pessoa') mapa.set(linha.question_id, linha.selo);
      }
      return mapa;
    })();
    this.guardado = { em: agora, promessa };
    promessa.catch(() => {
      if (this.guardado?.promessa === promessa) this.guardado = null;
    });
    return promessa;
  }
}

// Sem Supabase configurado (modo local de demonstração) não há revisão de IA.
class UnavailableQuestionSealsRepository implements QuestionSealsRepository {
  async getSeals(): Promise<Map<string, SeloDeRevisao>> {
    return new Map();
  }
}

export const questionSealsRepository: QuestionSealsRepository = isSupabaseConfigured
  ? new SupabaseQuestionSealsRepository()
  : new UnavailableQuestionSealsRepository();
