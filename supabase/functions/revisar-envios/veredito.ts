// Leitura do veredito da IA (44-F). Falha fechada: só "apto" quando a resposta
// tem, exatamente, uma linha de veredito no formato do prompt revisor e nada
// mais ambíguo em volta. Qualquer outra coisa — negrito, aspas, linha em outro
// lugar, duas linhas de veredito, resposta vazia, recusa, corte por max_tokens —
// é "erro", nunca "apto".

export type Veredito = 'apto' | 'nao_apto' | 'erro';

export interface RespostaDoModelo {
  /** `stop_reason` da resposta da API. Só "end_turn" pode virar apto ou não apto. */
  stopReason: string | null;
  /** Texto final da resposta (blocos de texto depois da última ferramenta). */
  texto: string;
}

export interface LeituraDoVeredito {
  veredito: Veredito;
  /** A linha exata do veredito, ou nulo quando não houve. */
  linhaDoVeredito: string | null;
  /** Tudo o que veio antes da linha do veredito (os achados). */
  achados: string;
  /** Conteúdo do bloco de correção (sem as cercas), se a resposta trouxe um. */
  blocoDeCorrecao: string | null;
  /** Por que deu erro (vazio quando não deu). */
  motivo: string;
}

const APTO = 'APTO PARA ENVIAR';
const NAO_APTO_UM = 'NÃO APTO — 1 achado grave';
// N ≥ 2: "NÃO APTO — 2 achados graves", "NÃO APTO — 12 achados graves"...
const NAO_APTO_N = /^NÃO APTO — ([2-9]|[1-9]\d+) achados graves$/;
const SEM_ALTERACAO = 'Nenhum achado muda o material.';
const INICIO_DO_BLOCO = 'Corrija o material conforme os achados abaixo';

function erro(motivo: string, achados = ''): LeituraDoVeredito {
  return { veredito: 'erro', linhaDoVeredito: null, achados, blocoDeCorrecao: null, motivo };
}

/** Linha que parece um veredito, com ou sem enfeite (negrito, aspas, marcador). */
function pareceVeredito(linha: string): boolean {
  const limpa = linha
    .replace(/^[\s>*_`"'“”‘’\-#•·]+/, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
  return /^(APTO|N[ÃA]O APTO)\b/.test(limpa);
}

function veredictoExato(linha: string): Veredito | null {
  if (linha === APTO) return 'apto';
  if (linha === NAO_APTO_UM || NAO_APTO_N.test(linha)) return 'nao_apto';
  return null;
}

export function lerVeredito(resposta: RespostaDoModelo): LeituraDoVeredito {
  if (resposta.stopReason !== 'end_turn') {
    return erro(`resposta sem fim normal (stop_reason: ${resposta.stopReason ?? 'nenhum'})`);
  }
  const texto = resposta.texto.replace(/\r\n/g, '\n').trimEnd();
  if (texto.trim() === '') return erro('resposta vazia');

  const linhas = texto.split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  const candidatas = linhas.map((l, i) => (pareceVeredito(l) ? i : -1)).filter((i) => i >= 0);
  if (candidatas.length === 0) return erro('nenhuma linha de veredito', texto);
  if (candidatas.length > 1) return erro('mais de uma linha de veredito', texto);

  const idx = candidatas[0];
  const linha = linhas[idx];
  const veredito = veredictoExato(linha);
  if (!veredito) return erro('linha de veredito fora do formato exato', texto);

  const achados = linhas.slice(0, idx).join('\n').trim();
  // O que vem depois da linha do veredito: nada, a frase "Nenhum achado muda o
  // material." ou UM bloco de código de correção até o fim da resposta.
  const cauda = linhas.slice(idx + 1);
  while (cauda.length > 0 && cauda[0].trim() === '') cauda.shift();
  if (cauda.length === 0) {
    return { veredito, linhaDoVeredito: linha, achados, blocoDeCorrecao: null, motivo: '' };
  }
  if (cauda.length === 1 && cauda[0] === SEM_ALTERACAO) {
    return { veredito, linhaDoVeredito: linha, achados, blocoDeCorrecao: null, motivo: '' };
  }

  const abertura = cauda[0];
  const fecho = cauda[cauda.length - 1];
  const cercas = cauda.filter((l) => /^```/.test(l.trim())).length;
  if (/^```[\w-]*$/.test(abertura.trim()) && fecho.trim() === '```' && cercas === 2 && cauda.length >= 3) {
    const conteudo = cauda.slice(1, -1).join('\n').trim();
    if (conteudo.startsWith(INICIO_DO_BLOCO)) {
      return { veredito, linhaDoVeredito: linha, achados, blocoDeCorrecao: conteudo, motivo: '' };
    }
  }
  return erro('a linha de veredito não é a última antes do bloco de correção', texto);
}

/** Junta os blocos de texto finais da resposta (depois da última ferramenta). */
export function textoFinalDaResposta(conteudo: ReadonlyArray<{ type: string; text?: string }>): string {
  const partes: string[] = [];
  for (let i = conteudo.length - 1; i >= 0; i -= 1) {
    const bloco = conteudo[i];
    if (bloco.type === 'text') partes.unshift(bloco.text ?? '');
    else if (bloco.type === 'thinking' || bloco.type === 'redacted_thinking') continue;
    else break;
  }
  return partes.join('');
}
