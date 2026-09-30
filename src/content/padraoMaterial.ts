// 44-D — os textos da página "Como escrever um material".
//
// São lidos, em tempo de build, dos MESMOS arquivos que a equipe edita em
// docs/editorial/ (import `?raw`): não há cópia do padrão nem dos prompts em
// outro lugar. Mudou o arquivo, muda o site no próximo build.
import padraoBruto from '../../docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md?raw';
import promptCriarBruto from '../../docs/editorial/PROMPT-CRIAR-MATERIAL.txt?raw';
import promptRevisarBruto from '../../docs/editorial/PROMPT-REVISAR-MATERIAL.txt?raw';
import { extrairParte1, montarTextoParaCopiar, normalizarTexto } from '../utils/padraoMaterial';

/** Parte 1 do padrão (para quem escreve). A Parte 2 nunca chega ao site. */
export const PARTE_1_DO_PADRAO = extrairParte1(padraoBruto);

export const PROMPT_CRIAR_MATERIAL = normalizarTexto(promptCriarBruto);
export const PROMPT_REVISAR_MATERIAL = normalizarTexto(promptRevisarBruto);

/** O que o botão "Copiar prompt para criar material" coloca na área de transferência. */
export const TEXTO_COPIAR_CRIAR = montarTextoParaCopiar(PROMPT_CRIAR_MATERIAL, PARTE_1_DO_PADRAO);

/** O que o botão "Copiar prompt revisor" coloca na área de transferência. */
export const TEXTO_COPIAR_REVISAR = montarTextoParaCopiar(PROMPT_REVISAR_MATERIAL, PARTE_1_DO_PADRAO);
