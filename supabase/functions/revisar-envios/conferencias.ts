// A conferência antes da IA e a leitura do texto aprovado (44-F/44-G/44-H2), tiradas de
// `index.ts` para que a Edge Function e o revisor local (D-12, `scripts/revisor-local/`)
// usem EXATAMENTE as mesmas regras: o mesmo importador da tela, sobre o pacote gerado
// `gerado/validacao.js`. Nada aqui depende de Deno nem de Node.
import type { Conferencia, LeitorDeMaterial, LeitorDeQuestoes } from './ciclo.ts';
import type { ModuloDeValidacao } from './tipos.ts';

export interface Conferencias {
  conferir: Conferencia;
  lerMaterial: LeitorDeMaterial;
  lerQuestoes: LeitorDeQuestoes;
}

export function montarConferencias(modulo: ModuloDeValidacao): Conferencias {
  const conferir: Conferencia = (envio, catalogo) => {
    if (envio.tipo === 'questoes') {
      // 44-H2: o mesmo importador de questões da tela (e do Admin), sem escolha manual.
      const leituraDoLote = modulo.lerLoteDeQuestoes(envio.texto, catalogo.disciplines, catalogo.themes);
      const avaliacaoDoLote = modulo.avaliarLote(leituraDoLote, catalogo.materiais ?? [], envio.materiais ?? []);
      return { aceito: avaliacaoDoLote.aceito, motivos: modulo.motivosDaRecusaDoLote(avaliacaoDoLote) };
    }
    const leitura = modulo.lerArquivoParaEnvio(envio.texto, catalogo.disciplines, catalogo.themes);
    const avaliacao = modulo.avaliarEnvio(
      leitura,
      { disciplineId: envio.disciplineId ?? '', themeId: envio.themeId ?? '' },
      catalogo.disciplines,
      catalogo.themes,
    );
    return { aceito: avaliacao.aceito, motivos: modulo.motivosDaReprovacao(avaliacao) };
  };

  // 44-G: o texto aprovado vira material pelo mesmo importador da tela.
  const lerMaterial: LeitorDeMaterial = (envio, catalogo) =>
    modulo.lerMaterialParaPublicar(envio.texto, catalogo.disciplines, catalogo.themes);

  // 44-H2: o texto aprovado de um lote vira as questões pelo mesmo importador da tela.
  const lerQuestoes: LeitorDeQuestoes = (envio, catalogo) =>
    modulo.lerQuestoesParaPublicar(envio.texto, catalogo.disciplines, catalogo.themes);

  return { conferir, lerMaterial, lerQuestoes };
}
