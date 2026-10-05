import { diaLocal } from './diaLocal';

// ============================================================================
// MAT-1 — "Baixar para atualizar": UM arquivo .txt com tudo o que uma IA precisa para reescrever um material no padrão
// de hoje. Nesta ordem: a instrução de abertura, o prompt de criação de material com a Parte 1 do padrão (o mesmo texto
// que o botão "Copiar prompt para criar material" da página "Como escrever um material" coloca na área de transferência;
// a Parte 2, de quem opera o site, nunca entra) e, no fim, o material atual exportado no formato do padrão.
//
// Aqui só se monta o texto (função pura). Os textos do prompt e do padrão vêm de `src/content/padraoMaterial.ts`, lidos dos
// arquivos de docs/editorial/: nenhuma cópia deles mora no código.
// ============================================================================

/** A linha que abre o material atual, no fim do arquivo. */
export const MARCA_MATERIAL_ATUAL = '=== MATERIAL ATUAL ===';

/** O primeiro bloco do arquivo, com o título do material e a versão do padrão de hoje. */
export function textoDeAberturaParaAtualizar(titulo: string, versaoDoPadrao: number): string {
  return [
    `Atualizar o material "${titulo}" para o padrão NexusMed de conteúdos, versão ${versaoDoPadrao}.`,
    '',
    `Reescreva o material que está no fim deste arquivo seguindo o prompt e o padrão abaixo. Mantenha o mesmo assunto e o mesmo lugar na árvore, escreva em português do Brasil e entregue um único arquivo .md completo, com a linha "**Versão do padrão:** ${versaoDoPadrao}".`,
  ].join('\n');
}

export interface PartesDoArquivoParaAtualizar {
  titulo: string;
  versaoDoPadrao: number;
  /** O prompt de criação de material, a marca de início, a Parte 1 do padrão e a marca de fim (`TEXTO_COPIAR_CRIAR`). */
  promptEPadrao: string;
  /** O material atual, já exportado no formato do padrão (`exportarMaterialParaMarkdown`). */
  materialAtual: string;
}

export function montarArquivoParaAtualizar(p: PartesDoArquivoParaAtualizar): string {
  return [
    textoDeAberturaParaAtualizar(p.titulo, p.versaoDoPadrao),
    '',
    p.promptEPadrao.trimEnd(),
    '',
    MARCA_MATERIAL_ATUAL,
    '',
    p.materialAtual.trimEnd(),
    '',
  ].join('\n');
}

/** "<nome-do-material>-para-atualizar-AAAA-MM-DD.txt", com o dia de hoje no relógio local. */
export function nomeDoArquivoParaAtualizar(nomeDoMarkdown: string, hoje: Date = new Date()): string {
  const base = nomeDoMarkdown.replace(/\.md$/i, '') || 'material';
  return `${base}-para-atualizar-${diaLocal(hoje)}.txt`;
}
