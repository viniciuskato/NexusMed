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
// migration 20261003120000): a tela só antecipa a resposta.
// ============================================================================

/** 300 KB, em bytes — o mesmo limite da tabela `material_submissions`. */
export const LIMITE_TEXTO_BYTES = 307200;
/** Envios esperando revisão ao mesmo tempo, por pessoa — o mesmo limite do banco. */
export const LIMITE_ENVIOS_EM_ESPERA = 3;
/** Título mais longo que isto é recusado (o banco também recusa). */
export const LIMITE_TITULO_CARACTERES = 300;
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
  apto: { rotulo: 'Aprovado na revisão', explicacao: 'O revisor de IA deu parecer favorável ao material. Quem decide e publica é o dono do site.' },
  nao_apto: { rotulo: 'Precisa de correção', explicacao: 'A revisão encontrou o que corrigir. Corrija o material e envie de novo.' },
  publicado: { rotulo: 'Publicado', explicacao: 'O material já está no ar para os estudantes, com o selo de revisado por IA.' },
  erro: { rotulo: 'A revisão não foi concluída', explicacao: 'Algo falhou do nosso lado. Seu material não foi rejeitado.' },
};

/** O mesmo para o envio de questões (44-H1): o rótulo é o mesmo, a explicação fala do lote de questões. */
export const ESTADO_EM_PALAVRAS_DE_QUESTOES: Record<EstadoDoEnvio, { rotulo: string; explicacao: string }> = {
  aguardando_revisao: { rotulo: 'Aguardando revisão', explicacao: 'Recebemos o lote de questões. Ele está na fila para ser revisado.' },
  em_revisao: { rotulo: 'Em revisão', explicacao: 'As questões estão sendo revisadas agora.' },
  apto: { rotulo: 'Aprovado na revisão', explicacao: 'O revisor de IA deu parecer favorável às questões. Quem decide e publica é o dono do site.' },
  nao_apto: { rotulo: 'Precisa de correção', explicacao: 'A revisão encontrou o que corrigir. Corrija as questões e envie de novo.' },
  publicado: { rotulo: 'Publicado', explicacao: 'As questões já estão no ar para os estudantes, com a marca de revisado por IA.' },
  erro: { rotulo: 'A revisão não foi concluída', explicacao: 'Algo falhou do nosso lado. Suas questões não foram rejeitadas.' },
};

export function estadoEmPalavras(
  status: string,
  tipo: 'material' | 'questoes' = 'material',
): { rotulo: string; explicacao: string } {
  const tabela = tipo === 'questoes' ? ESTADO_EM_PALAVRAS_DE_QUESTOES : ESTADO_EM_PALAVRAS;
  return tabela[status as EstadoDoEnvio] ?? { rotulo: 'Estado desconhecido', explicacao: '' };
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
  /**
   * Avisos que a importação dá ao aceitar o arquivo (ex.: "Citações em formato
   * antigo"), menos os que não são defeito: Autor é opcional no padrão, e
   * Disciplina/Tema fora do catálogo são tratados à parte, com a escolha da tela.
   */
  avisosDaImportacao: string[];
  /** Disciplina e Tema que o arquivo declara, resolvidos no catálogo (id null = não existe no catálogo). */
  disciplinaDoArquivo: { nome: string; id: string | null } | null;
  temaDoArquivo: { nome: string; id: string | null } | null;
}

/** Lê o arquivo uma vez (a parte cara); `avaliarEnvio` só compara com o que a pessoa escolheu. */
/** Aviso da importação que não é defeito do arquivo. */
function avisoIgnorado(aviso: string): boolean {
  return /^Autor$/i.test(aviso) || /^Disciplina ".*" não encontrada/.test(aviso) || /^Tema ".*" não encontrado/.test(aviso);
}

export function lerArquivoParaEnvio(texto: string, disciplines: Discipline[], themes: Theme[]): LeituraDoArquivo {
  const checagem = checarMaterialMarkdown(texto);
  const importacao = parseCompendiumMarkdownText(texto, disciplines, themes, []);
  const preview = importacao.ok ? importacao.preview : null;
  return {
    texto,
    bytes: tamanhoEmBytes(texto),
    titulo: preview?.title ?? '',
    checagem,
    avisosDaImportacao: preview ? preview.missingFields.filter((a) => !avisoIgnorado(a)) : [],
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
  /** Avisos que a importação deu ao ler o arquivo: também barram o envio. */
  avisosDaImportacao: string[];
  /** O título passa de 300 caracteres. */
  tituloLongo: boolean;
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
  const avisosDaImportacao = vazio ? [] : leitura.avisosDaImportacao;
  const tituloLongo = leitura.titulo.trim().length > LIMITE_TITULO_CARACTERES;

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
    avisosDaImportacao.length === 0 &&
    !tituloLongo &&
    problemasDeCatalogo.length === 0 &&
    leitura.titulo.trim().length > 0;

  return {
    vazio,
    bytes: leitura.bytes,
    tamanhoExcedido,
    errosDeImportacao,
    pendencias,
    avisosDaImportacao,
    tituloLongo,
    problemasDeCatalogo,
    aceito,
  };
}

/**
 * O material que o servidor cria quando a revisão de IA aprova o envio (44-G): o
 * mesmo que o importador da tela lê do arquivo, no formato que a função do banco
 * `revisao_publicar_envio` recebe. Disciplina, Tema e material acima NÃO vão
 * aqui: o banco os toma do próprio envio.
 */
export interface MaterialParaPublicar {
  title: string;
  subtitle: string | null;
  author: string | null;
  estimated_read_time_minutes: number | null;
  tags: string[];
  sections: Array<{
    title: string;
    content: string;
    key_takeaways: string[];
    mechanism_tag: string | null;
    clinical_pearl: string | null;
    warning_alert: string | null;
  }>;
  references: string[];
}

export type LeituraDoMaterial = { ok: true; material: MaterialParaPublicar } | { ok: false; motivos: string[] };

/** Lê o `.md` com o importador do botão "Importar material" e devolve o que vira material. */
export function lerMaterialParaPublicar(texto: string, disciplines: Discipline[], themes: Theme[]): LeituraDoMaterial {
  const importacao = parseCompendiumMarkdownText(texto, disciplines, themes, []);
  if (!importacao.ok) return { ok: false, motivos: importacao.errors };
  const { preview } = importacao;
  return {
    ok: true,
    material: {
      title: preview.title,
      subtitle: preview.subtitle || null,
      author: preview.author || null,
      estimated_read_time_minutes: preview.estimatedReadTimeMinutes || null,
      // Como o botão "Importar material" (buildCompendiumFromImport): sem palavra-chave, "Geral".
      tags: importacao.tags.length > 0 ? importacao.tags : ['Geral'],
      sections: importacao.sections.map((s) => ({
        title: s.title,
        content: s.content,
        key_takeaways: s.keyTakeaways,
        mechanism_tag: s.mechanismTag ?? null,
        clinical_pearl: s.clinicalPearl ?? null,
        warning_alert: s.warningAlert ?? null,
      })),
      references: importacao.references,
    },
  };
}

/** O aviso da importação em uma frase (os de campo ausente vêm só com o nome do campo). */
export function descreverAvisoDaImportacao(aviso: string): string {
  return /^[^—.]{1,40}$/.test(aviso) ? `Falta o campo “${aviso}”.` : aviso;
}

export function frasesDoTituloLongo(): string {
  return `O título passa de ${LIMITE_TITULO_CARACTERES} caracteres. Encurte-o (uma linha só, direto ao assunto).`;
}

/**
 * Por que o arquivo não pode ir à revisão, em frases (a lista que o servidor
 * guarda como achados quando reprova o arquivo antes de gastar com a IA).
 */
export function motivosDaReprovacao(av: AvaliacaoDoEnvio): string[] {
  const motivos: string[] = [];
  if (av.vazio) motivos.push('O texto do material está vazio.');
  if (av.tamanhoExcedido) {
    motivos.push(`O texto tem ${tamanhoLegivel(av.bytes)} e o limite é ${tamanhoLegivel(LIMITE_TEXTO_BYTES)}.`);
  }
  motivos.push(...av.errosDeImportacao);
  motivos.push(...av.problemasDeCatalogo);
  if (av.tituloLongo) motivos.push(frasesDoTituloLongo());
  motivos.push(...av.avisosDaImportacao.map(descreverAvisoDaImportacao));
  motivos.push(...av.pendencias.map((p) => `Linha ${p.linha} · ${p.secao}: ${p.mensagem}`));
  return motivos;
}

/**
 * Por que um envio "aguardando revisão" está esperando, em uma frase (limite de
 * custo do revisor de IA, travado no banco). Nulo quando não há motivo.
 */
export function fraseDaEspera(situacao: { usadasHoje: number; limitePorDia: number; mesEsgotado: boolean } | null): string | null {
  if (!situacao) return null;
  if (situacao.mesEsgotado) {
    return 'O limite de revisões deste mês foi atingido. Seu envio continua na fila e será revisado quando o limite voltar.';
  }
  if (situacao.limitePorDia > 0 && situacao.usadasHoje >= situacao.limitePorDia) {
    const usadas = situacao.limitePorDia === 1 ? 'a sua única revisão' : `as ${situacao.limitePorDia} revisões`;
    return `Você já usou ${usadas} de hoje. Seu envio será revisado amanhã.`;
  }
  return null;
}

/** Frase leiga para o erro que o banco devolve ao gravar o envio. */
export function mensagemDeErroDoEnvio(err: unknown, tipo: 'material' | 'questoes' = 'material'): string {
  const e = (err ?? {}) as { code?: string; message?: string; hint?: string; details?: string };
  const texto = `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}`;
  if (e.hint === 'limite_envios_em_espera' || texto.includes('limite_envios_em_espera')) {
    return `Você já tem ${LIMITE_ENVIOS_EM_ESPERA} envios esperando revisão. Quando a revisão de um deles terminar, você poderá enviar outro.`;
  }
  if (e.code === '23514' && /(material|question)_submissions_content_size/.test(texto)) {
    return tipo === 'questoes'
      ? `O texto passa de ${tamanhoLegivel(LIMITE_TEXTO_BYTES)}. Divida o lote de questões em mais de um envio.`
      : `O texto passa de ${tamanhoLegivel(LIMITE_TEXTO_BYTES)}. Reduza o material ou divida-o em mais de um.`;
  }
  // 44-B: pedido de atualização de um material.
  if (texto.includes('só quem é admin ou enviou este material')) {
    return 'Só quem é administrador ou enviou este material pode atualizá-lo.';
  }
  if (texto.includes('o material a atualizar precisa estar publicado')) {
    return 'Este material não está mais publicado, então não dá para atualizá-lo.';
  }
  if (texto.includes('publicado') && texto.includes('material acima')) {
    return 'O material acima precisa estar publicado. Escolha outro ou deixe em branco.';
  }
  if (texto.includes('materiais escolhidos precisam estar publicados')) {
    return 'Um dos materiais escolhidos não está mais publicado. Escolha outro.';
  }
  if (e.code === 'PGRST116') {
    return 'Este envio já não pode ser alterado: o estado dele mudou. Atualize a página para ver como está.';
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return tipo === 'questoes'
      ? 'Sem conexão. As questões não foram enviadas; tente de novo quando a rede voltar.'
      : 'Sem conexão. O material não foi enviado; tente de novo quando a rede voltar.';
  }
  return tipo === 'questoes'
    ? 'Não foi possível enviar as questões agora. Tente de novo em instantes.'
    : 'Não foi possível enviar o material agora. Tente de novo em instantes.';
}
