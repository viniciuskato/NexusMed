import { describe, it, expect } from 'vitest';
import { lerVeredito, textoFinalDaResposta } from '../../supabase/functions/revisar-envios/veredito.ts';

// 44-F — o veredito é lido pelo servidor, não por uma pessoa. Falha fechada:
// só as três formas exatas do prompt revisor, no lugar certo, viram "apto" ou
// "não apto". Qualquer outra coisa é "erro" — nunca "apto".

const ACHADOS = '1. Fato — seção Espectro: o trecho está errado.\n2. Referência — a referência 3 não sustenta a frase.';
const BLOCO = '```\nCorrija o material conforme os achados abaixo, mude só o que eles pedem e entregue os dois blocos de novo (o .md inteiro e O QUE MUDEI):\n1. Espectro: corrigir.\n```';

const fim = (texto: string, stopReason: string | null = 'end_turn') => lerVeredito({ stopReason, texto });

describe('44-F — as formas válidas do veredito', () => {
  it('"APTO PARA ENVIAR" como última linha', () => {
    const r = fim(`${ACHADOS}\n\nAPTO PARA ENVIAR`);
    expect(r.veredito).toBe('apto');
    expect(r.linhaDoVeredito).toBe('APTO PARA ENVIAR');
    expect(r.achados).toBe(ACHADOS);
    expect(r.blocoDeCorrecao).toBeNull();
    expect(r.motivo).toBe('');
  });

  it('"APTO PARA ENVIAR" seguido de "Nenhum achado muda o material."', () => {
    const r = fim(`${ACHADOS}\n\nAPTO PARA ENVIAR\n\nNenhum achado muda o material.`);
    expect(r.veredito).toBe('apto');
    expect(r.blocoDeCorrecao).toBeNull();
  });

  it('"NÃO APTO — 1 achado grave" seguido do bloco de correção', () => {
    const r = fim(`${ACHADOS}\n\nNÃO APTO — 1 achado grave\n\n${BLOCO}`);
    expect(r.veredito).toBe('nao_apto');
    expect(r.linhaDoVeredito).toBe('NÃO APTO — 1 achado grave');
    expect(r.achados).toBe(ACHADOS);
    expect(r.blocoDeCorrecao?.startsWith('Corrija o material conforme os achados abaixo')).toBe(true);
    expect(r.blocoDeCorrecao?.endsWith('1. Espectro: corrigir.')).toBe(true);
  });

  it.each([2, 3, 9, 10, 27])('"NÃO APTO — %i achados graves"', (n) => {
    const r = fim(`${ACHADOS}\n\nNÃO APTO — ${n} achados graves\n${BLOCO}`);
    expect(r.veredito).toBe('nao_apto');
    expect(r.linhaDoVeredito).toBe(`NÃO APTO — ${n} achados graves`);
  });

  it('bloco com marca de linguagem na cerca (```text) também vale', () => {
    const r = fim(`${ACHADOS}\n\nNÃO APTO — 2 achados graves\n\n${BLOCO.replace('```\n', '```text\n')}`);
    expect(r.veredito).toBe('nao_apto');
  });

  it('espaço no fim das linhas e fim de linha do Windows não atrapalham', () => {
    const r = fim(`${ACHADOS}  \r\n\r\nAPTO PARA ENVIAR   \r\n`);
    expect(r.veredito).toBe('apto');
  });
});

describe('44-F — tudo que não é exato vira "erro"', () => {
  const casos: Array<[string, string, string | null]> = [
    ['negrito', `${ACHADOS}\n\n**APTO PARA ENVIAR**`, 'end_turn'],
    ['aspas', `${ACHADOS}\n\n"APTO PARA ENVIAR"`, 'end_turn'],
    ['crases', `${ACHADOS}\n\n\`APTO PARA ENVIAR\``, 'end_turn'],
    ['marcador de lista', `${ACHADOS}\n\n- APTO PARA ENVIAR`, 'end_turn'],
    ['ponto final', `${ACHADOS}\n\nAPTO PARA ENVIAR.`, 'end_turn'],
    ['minúsculas', `${ACHADOS}\n\napto para enviar`, 'end_turn'],
    ['recuo antes da linha', `${ACHADOS}\n\n  APTO PARA ENVIAR`, 'end_turn'],
    ['prefixo na mesma linha', `${ACHADOS}\n\nVeredito: APTO PARA ENVIAR`, 'end_turn'],
    ['sem o travessão certo', `${ACHADOS}\n\nNÃO APTO - 2 achados graves`, 'end_turn'],
    ['sem acento', `${ACHADOS}\n\nNAO APTO — 2 achados graves`, 'end_turn'],
    ['zero achados graves', `${ACHADOS}\n\nNÃO APTO — 0 achados graves`, 'end_turn'],
    ['singular com N maior que 1', `${ACHADOS}\n\nNÃO APTO — 2 achado grave`, 'end_turn'],
    ['plural com 1', `${ACHADOS}\n\nNÃO APTO — 1 achados graves`, 'end_turn'],
    ['número com zero à frente', `${ACHADOS}\n\nNÃO APTO — 02 achados graves`, 'end_turn'],
    ['veredito colado a outro texto', `${ACHADOS}\n\nAPTO PARA ENVIAR agora`, 'end_turn'],
    ['linha que não é a última antes do bloco (texto depois)', `${ACHADOS}\n\nAPTO PARA ENVIAR\n\nObrigado por enviar.`, 'end_turn'],
    ['linha de veredito no meio, com achados depois', `NÃO APTO — 1 achado grave\n\n${ACHADOS}`, 'end_turn'],
    ['duas linhas de veredito iguais', `${ACHADOS}\n\nAPTO PARA ENVIAR\nAPTO PARA ENVIAR`, 'end_turn'],
    ['duas linhas de veredito diferentes', `NÃO APTO — 1 achado grave\n\n${ACHADOS}\n\nAPTO PARA ENVIAR`, 'end_turn'],
    ['veredito citado dentro de um achado', `1. O texto do autor diz:\nAPTO PARA ENVIAR\n${ACHADOS}\n\nNÃO APTO — 2 achados graves`, 'end_turn'],
    ['sem linha de veredito', ACHADOS, 'end_turn'],
    ['vazio', '', 'end_turn'],
    ['só espaços', '  \n\n   ', 'end_turn'],
    ['bloco depois do veredito sem a frase de abertura', `${ACHADOS}\n\nNÃO APTO — 2 achados graves\n\n\`\`\`\nfaça outra coisa\n\`\`\``, 'end_turn'],
    ['bloco sem fechar', `${ACHADOS}\n\nNÃO APTO — 2 achados graves\n\n\`\`\`\nCorrija o material conforme os achados abaixo`, 'end_turn'],
    ['dois blocos', `${ACHADOS}\n\nNÃO APTO — 2 achados graves\n\n${BLOCO}\n\n${BLOCO}`, 'end_turn'],
    ['bloco seguido de texto', `${ACHADOS}\n\nNÃO APTO — 2 achados graves\n\n${BLOCO}\n\nFim.`, 'end_turn'],
    ['recusa do modelo', `${ACHADOS}\n\nAPTO PARA ENVIAR`, 'refusal'],
    ['corte por max_tokens', `${ACHADOS}\n\nAPTO PARA ENVIAR`, 'max_tokens'],
    ['pausa sem fim', `${ACHADOS}\n\nAPTO PARA ENVIAR`, 'pause_turn'],
    ['parada por ferramenta', `${ACHADOS}\n\nAPTO PARA ENVIAR`, 'tool_use'],
    ['janela de contexto estourada', `${ACHADOS}\n\nAPTO PARA ENVIAR`, 'model_context_window_exceeded'],
    ['sem stop_reason', `${ACHADOS}\n\nAPTO PARA ENVIAR`, null],
  ];

  it.each(casos)('%s', (_nome, texto, stopReason) => {
    const r = fim(texto, stopReason);
    expect(r.veredito).toBe('erro');
    expect(r.linhaDoVeredito).toBeNull();
    expect(r.blocoDeCorrecao).toBeNull();
    expect(r.motivo.length).toBeGreaterThan(0);
  });

  it('nenhum dos casos inválidos chega perto de "apto"', () => {
    for (const [, texto, stopReason] of casos) {
      expect(fim(texto, stopReason).veredito).not.toBe('apto');
    }
  });
});

describe('44-F — o texto final da resposta', () => {
  it('junta os blocos de texto depois da última ferramenta, sem o raciocínio', () => {
    const conteudo = [
      { type: 'text', text: 'Vou conferir a bula.' },
      { type: 'server_tool_use' },
      { type: 'web_search_tool_result' },
      { type: 'thinking' },
      { type: 'text', text: 'Achados...\n' },
      { type: 'text', text: '\nAPTO PARA ENVIAR' },
    ];
    expect(textoFinalDaResposta(conteudo)).toBe('Achados...\n\nAPTO PARA ENVIAR');
  });

  it('sem texto no fim devolve vazio (que vira erro)', () => {
    expect(textoFinalDaResposta([{ type: 'text', text: 'antes' }, { type: 'web_fetch_tool_result' }])).toBe('');
    expect(textoFinalDaResposta([])).toBe('');
  });
});
