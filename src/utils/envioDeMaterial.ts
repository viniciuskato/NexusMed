import type { Discipline, Theme } from '../types';
import { checarMaterialMarkdown, type PendenciaDoPadrao, type ResultadoDaChecagem } from './compendiumStandardCheck';
import { parseCompendiumMarkdownText } from './compendiumMarkdownImport';

// ============================================================================
// Envio de material pelo site (44-E) — regras que a tela aplica ao vivo.
//
// Nada da leitura nem da checagem é reimplementado: a checagem do padrão é a
// mesma de `npm run checar:material` (`checarMaterialMarkdown`) e o importador
// é o mesmo do botão "Importar material" (`parseCompendiumMarkdownText`). O
// que este módulo acrescenta é só o que é do envio: tamanho, e a Disciplina e
// o Tema escolhidos na tela contra os que o arquivo declara.
//
// O banco é a autoridade nos limites (300 KB e 3 envios esperando revisão,
// migration 20260929120000): a tela só antecipa a resposta.
// ============================================================================

/** 300 KB, em bytes — o mesmo limite da tabela `material_submissions`. */
export const LIMITE_TEXTO_BYTES = 307200;
/** Envios esperando revisão ao mesmo tempo, por pessoa — o mesmo limite do banco. */
export const LIMITE_ENVIOS_EM_ESPERA = 3;
/** Arquivo maior que isto nem é lido: não cabe no limite com folga e travaria a tela. */
export const LIMITE_LEITURA_DE_ARQUIVO_BYTES = LIMITE_TEXTO_BYTES * 4;

export type EstadoDoEnvio = 'aguardando_revisao' | 'em_revisao' | 'apto' | 'nao_apto' | 'publicado' | 'erro';

export const ESTADOS_DO_ENVIO: readonly EstadoDoEnvio[] = [
  'aguardando_revisao',
  'em_revisao',
  'apto',
  'nao_apto',
  'publicado',
  'erro',
];

/** O estado em palavras leigas: o nome curto e o que ele quer dizer para quem enviou. */
export const ESTADO_EM_PALAVRAS: Record<EstadoDoEnvio, { rotulo: string; explicacao: string }> = {
  aguardando_revisao: { rotulo: 'Aguardando revisão', explicacao: 'Recebemos o material. Ele está na fila para ser revisado.' },
  em_revisao: { rotulo: 'Em revisão', explicacao: 'O material está sendo revisado agora.' },
  apto: { rotulo: 'Aprovado na revisão', explicacao: 'A revisão aprovou o material. Falta ele ser publicado.' },
  nao_apto: { rotulo: 'Precisa de correção', explicacao: 'A revisão encontrou o que corrigir. Corrija o material e envie de novo.' },
  publicado: { rotulo: 'Publicado', explicacao: 'O material já está no ar para os estudantes.' },
  erro: { rotulo: 'A revisão não foi concluída', explicacao: 'Algo falhou do nosso lado. Seu material não foi rejeitado.' },
};

export function estadoEmPalavras(status: string): { rotulo: string; explicacao: string } {
  return ESTADO_EM_PALAVRAS[status as EstadoDoEnvio] ?? { rotulo: 'Estado desconhecido', explicacao: '' };
}

/** Tamanho do texto em bytes (o que o banco mede), não em letras. */
export function tamanhoEmBytes(texto: string): number {
  return new TextEncoder().encode(texto).length;
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  return `${(bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`;
}

export interface LeituraDoArquivo {
  texto: string;
  bytes: number;
  /** Título do arquivo (primeira linha `# `), ou ''. */
  titulo: string;
  /** A checagem do padrão e a recusa do importador, como em `npm run checar:material`. */
  checagem: ResultadoDaChecagem;
  /** Disciplina e Tema que o arquivo declara, resolvidos no catálogo (id null = não existe no catálogo). */
  disciplinaDoArquivo: { nome: string; id: string | null } | null;
  temaDoArquivo: { nome: string; id: string | null } | null;
}

/** Lê o arquivo uma vez (a parte cara); `avaliarEnvio` só compara com o que a pessoa escolheu. */
export function lerArquivoParaEnvio(texto: string, disciplines: Discipline[], themes: Theme[]): LeituraDoArquivo {
  const checagem = checarMaterialMarkdown(texto);
  const importacao = parseCompendiumMarkdownText(texto, disciplines, themes, []);
  const preview = importacao.ok ? importacao.preview : null;
  return {
    texto,
    bytes: tamanhoEmBytes(texto),
    titulo: preview?.title ?? '',
    checagem,
    disciplinaDoArquivo: preview ? { nome: preview.disciplineName, id: preview.disciplineId } : null,
    temaDoArquivo: preview ? { nome: preview.themeName, id: preview.themeId } : null,
  };
}

export interface EscolhaDoEnvio {
  disciplineId: string;
  themeId: string;
}

export interface AvaliacaoDoEnvio {
  vazio: boolean;
  bytes: number;
  tamanhoExcedido: boolean;
  /** A importação recusaria o arquivo (mensagens dela). */
  errosDeImportacao: string[];
  /** Pendências da checagem do padrão. */
  pendencias: PendenciaDoPadrao[];
  /** Disciplina/Tema: faltam escolher, não existem no catálogo ou diferem do que o arquivo declara. */
  problemasDeCatalogo: string[];
  /** Só com tudo acima limpo o botão Enviar habilita. */
  aceito: boolean;
}

export function avaliarEnvio(
  leitura: LeituraDoArquivo,
  escolha: EscolhaDoEnvio,
  disciplines: Discipline[],
  themes: Theme[],
): AvaliacaoDoEnvio {
  const vazio = leitura.texto.trim().length === 0;
  const tamanhoExcedido = leitura.bytes > LIMITE_TEXTO_BYTES;
  const errosDeImportacao = vazio ? [] : leitura.checagem.errosDeImportacao;
  const pendencias = vazio ? [] : leitura.checagem.pendencias;

  const problemasDeCatalogo: string[] = [];
  if (!vazio) {
    const disciplinaEscolhida = disciplines.find((d) => d.id === escolha.disciplineId);
    const temaEscolhido = themes.find((t) => t.id === escolha.themeId && t.disciplineId === escolha.disciplineId);
    if (!disciplinaEscolhida) problemasDeCatalogo.push('Escolha a Disciplina do material.');
    else if (!temaEscolhido) problemasDeCatalogo.push('Escolha o Tema do material.');

    const { disciplinaDoArquivo, temaDoArquivo } = leitura;
    if (disciplinaDoArquivo) {
      if (!disciplinaDoArquivo.id) {
        problemasDeCatalogo.push(
          `A Disciplina escrita no arquivo (“${disciplinaDoArquivo.nome}”) não existe no catálogo. Use o nome exato da lista da página “Como escrever um material”.`,
        );
      } else if (disciplinaEscolhida && disciplinaDoArquivo.id !== disciplinaEscolhida.id) {
        problemasDeCatalogo.push(
          `A Disciplina escrita no arquivo (“${disciplinaDoArquivo.nome}”) não é a que você escolheu (“${disciplinaEscolhida.name}”).`,
        );
      }
    }
    if (temaDoArquivo) {
      if (!temaDoArquivo.id) {
        problemasDeCatalogo.push(
          `O Tema escrito no arquivo (“${temaDoArquivo.nome}”) não existe no catálogo. Use o nome exato da lista da página “Como escrever um material”.`,
        );
      } else if (temaEscolhido && temaDoArquivo.id !== temaEscolhido.id) {
        problemasDeCatalogo.push(
          `O Tema escrito no arquivo (“${temaDoArquivo.nome}”) não é o que você escolheu (“${temaEscolhido.name}”).`,
        );
      }
    }
  }

  const aceito =
    !vazio &&
    !tamanhoExcedido &&
    errosDeImportacao.length === 0 &&
    pendencias.length === 0 &&
    problemasDeCatalogo.length === 0 &&
    leitura.titulo.trim().length > 0;

  return { vazio, bytes: leitura.bytes, tamanhoExcedido, errosDeImportacao, pendencias, problemasDeCatalogo, aceito };
}

/** Frase leiga para o erro que o banco devolve ao gravar o envio. */
export function mensagemDeErroDoEnvio(err: unknown): string {
  const e = (err ?? {}) as { code?: string; message?: string; hint?: string; details?: string };
  const texto = `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}`;
  if (e.hint === 'limite_envios_em_espera' || texto.includes('limite_envios_em_espera')) {
    return `Você já tem ${LIMITE_ENVIOS_EM_ESPERA} envios esperando revisão. Quando a revisão de um deles terminar, você poderá enviar outro.`;
  }
  if (e.code === '23514' && texto.includes('material_submissions_content_size')) {
    return `O texto passa de ${tamanhoLegivel(LIMITE_TEXTO_BYTES)}. Reduza o material ou divida-o em mais de um.`;
  }
  if (texto.includes('publicado') && texto.includes('material acima')) {
    return 'O material acima precisa estar publicado. Escolha outro ou deixe em branco.';
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Sem conexão. O material não foi enviado; tente de novo quando a rede voltar.';
  }
  return 'Não foi possível enviar o material agora. Tente de novo em instantes.';
}
