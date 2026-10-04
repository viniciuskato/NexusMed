// Figuras nos materiais (P9, padrão de conteúdos v3).
//
// A figura entra no texto do material como um bloco de três linhas, sem linha em branco no meio:
//
//   ![Texto alternativo, para quem não vê a imagem](figura:<identificador>)
//   **Figura 1.** Legenda da figura.
//   Fonte: Autor ou entidade, título, ano.
//
// `<identificador>` é o que o botão "Enviar imagem" devolve (um UUID). Enquanto a imagem não foi enviada, quem
// escreve (pessoa ou IA) marca o lugar com `figura:PENDENTE` e uma quarta linha `Mostrar: o que a figura deve
// conter`; a checagem do padrão aponta o bloco pendente e o envio não passa.
//
// Esta é a ÚNICA leitura do bloco: o leitor (`SafeMarkdown`) e a checagem do padrão (`compendiumStandardCheck.ts`)
// usam `lerFigura`, para não divergirem. Nada aqui aceita endereço externo: o leitor só mostra imagem que vem do
// Storage do próprio site, pelo identificador.

/** Identificador de figura: UUID em minúsculas (o que `crypto.randomUUID()` e o banco geram). */
export const FIGURA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Palavra que marca a figura ainda não enviada. */
export const FIGURA_PENDENTE = 'PENDENTE';

// O destino vai até o último `)` da linha: `javascript:alert(1)` tem parêntese dentro e continua sendo lido (como destino inválido).
const LINHA_DA_IMAGEM = /^!\[([^\]]*)\]\((.*)\)\s*$/;
const ROTULO_DA_FONTE = /^(?:\*\*)?Fonte:(?:\*\*)?\s*(.*)$/i;
const ROTULO_DO_MOSTRAR = /^(?:\*\*)?Mostrar:(?:\*\*)?\s*(.*)$/i;

export type DestinoDaFigura =
  | { tipo: 'figura'; id: string }
  | { tipo: 'pendente' }
  /** Qualquer outra coisa: endereço externo, caminho, `javascript:`, `data:`, identificador malformado. */
  | { tipo: 'invalido'; bruto: string };

export interface FiguraLida {
  alt: string;
  destino: DestinoDaFigura;
  /** Texto da legenda (Markdown inline), sem a linha da fonte. Vazio se faltar. */
  legenda: string;
  /** Texto da fonte, sem o rótulo "Fonte:". Vazio se faltar. */
  fonte: string;
  /** Instrução "Mostrar:" de uma figura pendente, se houver. */
  mostrar: string;
  /** Quantas linhas do bloco foram lidas (a imagem, a legenda, a fonte e o "Mostrar"). */
  linhas: number;
}

/** A linha abre uma figura? (`![...](...)` sozinha na linha.) */
export function eLinhaDeFigura(linha: string): boolean {
  return LINHA_DA_IMAGEM.test(linha.trim());
}

export function destinoDaFigura(bruto: string): DestinoDaFigura {
  const destino = bruto.trim();
  if (destino === `figura:${FIGURA_PENDENTE}`) return { tipo: 'pendente' };
  const m = destino.match(/^figura:(.+)$/);
  if (m && FIGURA_ID.test(m[1])) return { tipo: 'figura', id: m[1] };
  return { tipo: 'invalido', bruto: destino };
}

/**
 * Lê o bloco de figura que começa na primeira linha de `linhas`: a linha da imagem, a legenda (uma ou mais
 * linhas), a linha `Fonte:` e, opcionalmente, `Mostrar:`. Para na linha em branco ou depois da fonte (e do
 * "Mostrar"). Devolve nulo se a primeira linha não é uma figura.
 */
export function lerFigura(linhas: string[]): FiguraLida | null {
  if (linhas.length === 0) return null;
  const abertura = linhas[0].trim().match(LINHA_DA_IMAGEM);
  if (!abertura) return null;

  const legendaLinhas: string[] = [];
  let fonte = '';
  let mostrar = '';
  let temFonte = false;
  let lidas = 1;
  for (let k = 1; k < linhas.length; k++) {
    const linha = linhas[k].trim();
    if (linha === '') break;
    const rotuloMostrar = linha.match(ROTULO_DO_MOSTRAR);
    if (temFonte && !rotuloMostrar) break;
    if (rotuloMostrar) {
      mostrar = rotuloMostrar[1].trim();
      lidas = k + 1;
      break;
    }
    const rotuloFonte = linha.match(ROTULO_DA_FONTE);
    if (rotuloFonte) {
      fonte = rotuloFonte[1].trim();
      temFonte = true;
    } else {
      legendaLinhas.push(linha);
    }
    lidas = k + 1;
  }

  return {
    alt: abertura[1].trim(),
    destino: destinoDaFigura(abertura[2]),
    legenda: legendaLinhas.join(' ').trim(),
    fonte,
    mostrar,
    linhas: lidas,
  };
}

/** Atalho do leitor: o bloco inteiro (já separado por linhas em branco) como uma figura, ou nulo. */
export function lerBlocoDeFigura(bloco: string): FiguraLida | null {
  return lerFigura(bloco.split('\n'));
}

// --- Envio da imagem -----------------------------------------------------------------------------------------------

/** 10 MiB, o mesmo limite do bucket. */
export const LIMITE_DA_IMAGEM_BYTES = 10 * 1024 * 1024;

export const TIPOS_DE_IMAGEM = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type TipoDeImagem = (typeof TIPOS_DE_IMAGEM)[number];

const EXTENSAO_DO_TIPO: Record<TipoDeImagem, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function extensaoDoTipo(tipo: TipoDeImagem): string {
  return EXTENSAO_DO_TIPO[tipo];
}

/** Caminho do arquivo no bucket: `<id>.<extensão>`, o que a política do banco exige. */
export function caminhoDaFigura(id: string, tipo: TipoDeImagem): string {
  return `${id}.${extensaoDoTipo(tipo)}`;
}

/** O tipo pelos primeiros bytes do arquivo (o que o navegador diz do arquivo não basta), ou nulo. */
export function tipoPelosBytes(bytes: Uint8Array): TipoDeImagem | null {
  const igual = (inicio: number, esperado: number[]) => esperado.every((b, i) => bytes[inicio + i] === b);
  if (bytes.length >= 8 && igual(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (bytes.length >= 3 && igual(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  // WebP: "RIFF" ???? "WEBP"
  if (bytes.length >= 12 && igual(0, [0x52, 0x49, 0x46, 0x46]) && igual(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  return null;
}

export function tamanhoDaImagemLegivel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/** Por que o arquivo não serve, em palavras leigas; nulo se serve (a conferência dos bytes é à parte). */
export function motivoDaImagemRecusada(arquivo: { type: string; size: number; name: string }): string | null {
  if (arquivo.size <= 0) return 'O arquivo está vazio.';
  if (arquivo.size > LIMITE_DA_IMAGEM_BYTES) {
    return `A imagem tem ${tamanhoDaImagemLegivel(arquivo.size)} e passa de 10 MB. Reduza-a e tente de novo.`;
  }
  if (!(TIPOS_DE_IMAGEM as readonly string[]).includes(arquivo.type)) {
    return 'Só imagens PNG, JPEG ou WebP são aceitas.';
  }
  return null;
}

/** Texto de uma linha só: sem quebra de linha e sem espaços repetidos (o bloco de figura não admite linha em branco). */
function umaLinha(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

export interface DadosDoTrecho {
  id: string;
  alt: string;
  legenda: string;
  fonte: string;
  /** Número da figura no material; sem número, a legenda começa só por "Figura.". */
  numero?: number;
}

/** O trecho pronto para colar no .md: o bloco de três linhas que a leitura e a checagem entendem. */
export function montarTrechoDaFigura({ id, alt, legenda, fonte, numero }: DadosDoTrecho): string {
  const rotulo = numero && numero > 0 ? `**Figura ${numero}.**` : '**Figura.**';
  const alternativo = umaLinha(alt).replace(/[[\]]/g, '');
  return [`![${alternativo}](figura:${id})`, `${rotulo} ${umaLinha(legenda)}`, `Fonte: ${umaLinha(fonte)}`].join('\n');
}
