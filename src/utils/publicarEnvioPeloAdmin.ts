import type { Discipline, Theme } from '../types';
import {
  materialSubmissionsRepository,
  type MaterialSubmission,
  type ResultadoDaPublicacaoDoAdmin,
} from '../repositories/MaterialSubmissionsRepository';
import { questionSubmissionsRepository, type QuestionSubmission } from '../repositories/QuestionSubmissionsRepository';
import { lerMaterialParaPublicar } from './envioDeMaterial';
import { lerQuestoesParaPublicar } from './envioDeQuestoes';

// ============================================================================
// P8 — o dono publica o envio com um clique, com qualquer parecer do revisor.
//
// O revisor de IA só aconselha (D-12). Aqui a tela lê o texto do envio, passa pelo MESMO importador de sempre
// (`lerMaterialParaPublicar`, `lerQuestoesParaPublicar`) e chama a função do banco que só o admin executa
// (`admin_publicar_envio`, `admin_aplicar_atualizacao`, `admin_publicar_questoes`). O banco decide o resto: o
// selo "Revisado por IA" só nasce com revisão "apto" do texto atual; recusa e falha não mudam o envio.
// ============================================================================

export type EnvioParaPublicar = MaterialSubmission | QuestionSubmission;

export interface ResultadoDaAcao {
  /** Verdadeiro quando o conteúdo está no ar (ou já estava): a lista deve ser recarregada. */
  ok: boolean;
  /** Em palavras leigas, para mostrar ao lado do botão. */
  texto: string;
}

/** Estados em que o admin pode publicar: qualquer um em que o revisor não está lendo agora e que ainda não foi ao ar. */
export function podePublicarEnvio(status: string): boolean {
  return status === 'aguardando_revisao' || status === 'apto' || status === 'nao_apto' || status === 'erro';
}

/** O veredito do revisor em palavras leigas, para o "parecer ao lado do botão". */
export function parecerEmPalavras(veredito: 'apto' | 'nao_apto' | 'erro' | null | undefined, status: string): string {
  if (veredito === 'apto') return 'apto (o revisor deu parecer favorável)';
  if (veredito === 'nao_apto') return 'não apto (o revisor encontrou o que corrigir)';
  if (veredito === 'erro') return 'a revisão não foi concluída';
  return status === 'em_revisao' ? 'o revisor está lendo agora' : 'ainda sem parecer do revisor';
}

/** O resultado do banco em uma frase para o dono. */
export function mensagemDoResultado(r: ResultadoDaPublicacaoDoAdmin, tipo: 'material' | 'questoes' | 'atualizacao'): ResultadoDaAcao {
  switch (r.resultado) {
    case 'publicado':
      if (tipo === 'questoes') {
        const n = r.question_ids?.length ?? 0;
        return { ok: true, texto: n === 1 ? '1 questão publicada.' : `${n} questões publicadas.` };
      }
      return { ok: true, texto: 'Material publicado.' };
    case 'aplicado':
      return { ok: true, texto: 'Atualização aplicada: o material que está no ar já tem o conteúdo novo.' };
    case 'sem_mudanca':
      return { ok: true, texto: 'O arquivo é igual ao material que está no ar: nada mudou.' };
    case 'ja_publicado':
      return { ok: true, texto: 'Este envio já estava publicado.' };
    case 'recusado':
      return { ok: false, texto: r.motivo ?? 'O banco recusou a publicação. Nada foi alterado.' };
    case 'falhou':
      return { ok: false, texto: 'Não foi possível publicar agora. Nada foi alterado; tente de novo.' };
    case 'texto_mudou':
      return { ok: false, texto: 'O texto deste envio mudou enquanto você publicava. Nada foi publicado: atualize a lista e confira de novo.' };
    case 'texto_invalido':
      return { ok: false, texto: 'O texto deste envio não pôde ser lido como material. Nada foi alterado.' };
    case 'fora_de_estado':
      return {
        ok: false,
        texto:
          r.estado === 'em_revisao'
            ? 'O revisor está lendo este envio agora. Espere o parecer e tente de novo.'
            : 'Este envio não pode ser publicado no estado em que está. Atualize a lista e confira.',
      };
    default:
      return { ok: false, texto: 'Resposta inesperada do servidor. Nada foi confirmado: atualize a lista e confira.' };
  }
}

/** Frase leiga para o erro que a chamada devolve (rede, permissão). */
export function mensagemDeErroDaPublicacao(err: unknown): string {
  const e = (err ?? {}) as { code?: string; message?: string };
  if (e.code === '42501' || /acesso negado/i.test(e.message ?? '')) return 'Só administradores ativos publicam envios.';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Sem conexão. Nada foi publicado; tente de novo quando a rede voltar.';
  return 'Não foi possível publicar agora. Nada foi alterado; tente de novo em instantes.';
}

const MAX_MOTIVOS = 3;

function recusaDaLeitura(motivos: string[]): ResultadoDaAcao {
  const lista = motivos.slice(0, MAX_MOTIVOS).join(' ');
  const resto = motivos.length > MAX_MOTIVOS ? ` (e mais ${motivos.length - MAX_MOTIVOS})` : '';
  return { ok: false, texto: `O texto do envio não pôde ser lido pelo importador, então nada foi publicado. ${lista}${resto}`.trim() };
}

/**
 * Publica (ou aplica) o envio: lê o texto e o hash dele, passa pelo importador e chama o banco. Nunca lança: o resultado
 * (ou o erro, em palavras leigas) volta para ser mostrado ao lado do botão.
 */
export async function publicarEnvioPeloAdmin(
  envio: EnvioParaPublicar,
  catalogo: { disciplines: Discipline[]; themes: Theme[] },
): Promise<ResultadoDaAcao> {
  try {
    if ('kind' in envio && envio.kind === 'questoes') {
      const { contentMd, contentSha256 } = await questionSubmissionsRepository.textoParaPublicar(envio.id);
      const leitura = lerQuestoesParaPublicar(contentMd, catalogo.disciplines, catalogo.themes);
      if (!leitura.ok) return recusaDaLeitura(leitura.motivos);
      return mensagemDoResultado(await questionSubmissionsRepository.publicarComoAdmin(envio.id, contentSha256, leitura.questoes), 'questoes');
    }
    const material = envio as MaterialSubmission;
    const { contentMd, contentSha256 } = await materialSubmissionsRepository.textoParaPublicar(material.id);
    const leitura = lerMaterialParaPublicar(contentMd, catalogo.disciplines, catalogo.themes);
    if (!leitura.ok) return recusaDaLeitura(leitura.motivos);
    if (material.targetMaterialId) {
      return mensagemDoResultado(await materialSubmissionsRepository.aplicarAtualizacaoComoAdmin(material.id, contentSha256, leitura.material), 'atualizacao');
    }
    return mensagemDoResultado(await materialSubmissionsRepository.publicarComoAdmin(material.id, contentSha256, leitura.material), 'material');
  } catch (err) {
    return { ok: false, texto: mensagemDeErroDaPublicacao(err) };
  }
}
