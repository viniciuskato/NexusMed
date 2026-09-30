// Formato do pacote gerado `gerado/validacao.js` (a checagem do padrão e a
// importação da tela de envio, empacotadas por scripts/gerar-revisor.ts).
// Tipos mínimos: só o que o servidor usa.
export interface ModuloDeValidacao {
  lerArquivoParaEnvio(
    texto: string,
    disciplines: Array<{ id: string; name: string }>,
    themes: Array<{ id: string; name: string; disciplineId: string }>,
  ): unknown;
  avaliarEnvio(
    leitura: unknown,
    escolha: { disciplineId: string; themeId: string },
    disciplines: Array<{ id: string; name: string }>,
    themes: Array<{ id: string; name: string; disciplineId: string }>,
  ): { aceito: boolean };
  motivosDaReprovacao(avaliacao: { aceito: boolean }): string[];
  /** 44-G: o material que o servidor cria do texto aprovado (o mesmo importador da tela). */
  lerMaterialParaPublicar(
    texto: string,
    disciplines: Array<{ id: string; name: string }>,
    themes: Array<{ id: string; name: string; disciplineId: string }>,
  ): { ok: true; material: Record<string, unknown> } | { ok: false; motivos: string[] };
}
