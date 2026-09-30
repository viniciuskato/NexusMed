// 44-H1 — os textos de "Como escrever questões".
//
// Lidos, em tempo de build, dos MESMOS arquivos que a equipe edita em
// docs/editorial/ (import `?raw`): não há cópia do padrão nem dos prompts em
// outro lugar. O padrão de questões para quem escreve é um documento próprio e
// autocontido; o PADRAO-NEXUSMED-QUESTOES.md (guia de quem opera a plataforma)
// não entra aqui.
import padraoBruto from '../../docs/editorial/PADRAO-QUESTOES-PARA-QUEM-ESCREVE.md?raw';
import promptCriarBruto from '../../docs/editorial/PROMPT-CRIAR-QUESTOES.txt?raw';
import promptRevisarBruto from '../../docs/editorial/PROMPT-REVISAR-QUESTOES.txt?raw';
import {
  MARCA_FIM_PADRAO_QUESTOES,
  MARCA_INICIO_PADRAO_QUESTOES,
  extrairPadraoDeQuestoes,
  montarTextoParaCopiar,
  normalizarTexto,
} from '../utils/padraoMaterial';

const MARCAS = { inicio: MARCA_INICIO_PADRAO_QUESTOES, fim: MARCA_FIM_PADRAO_QUESTOES };

/** O padrão de questões para quem escreve, como está no arquivo. */
export const PADRAO_DE_QUESTOES = extrairPadraoDeQuestoes(padraoBruto);

export const PROMPT_CRIAR_QUESTOES = normalizarTexto(promptCriarBruto);
export const PROMPT_REVISAR_QUESTOES = normalizarTexto(promptRevisarBruto);

/** O que o botão "Copiar prompt para criar questões" coloca na área de transferência. */
export const TEXTO_COPIAR_CRIAR_QUESTOES = montarTextoParaCopiar(PROMPT_CRIAR_QUESTOES, PADRAO_DE_QUESTOES, MARCAS);

/** O que o botão "Copiar prompt revisor de questões" coloca na área de transferência. */
export const TEXTO_COPIAR_REVISAR_QUESTOES = montarTextoParaCopiar(PROMPT_REVISAR_QUESTOES, PADRAO_DE_QUESTOES, MARCAS);
