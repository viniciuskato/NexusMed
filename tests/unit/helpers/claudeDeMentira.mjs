// Um `claude -p` de mentira para os testes do revisor local (D-12): lê a entrada padrão, anota o que
// recebeu (argumentos, tamanho da entrada, se as variáveis de cobrança chegaram) e responde no formato
// `--output-format json` do claude de verdade. Nenhuma chamada real: nem à assinatura nem à API.
//
// Quem decide a resposta: a variável FAKE_CLAUDE_MODO (apto, nao_apto, cota, falha, dorme, sem_json)
// ou, se a entrada trouxer uma destas marcas, ela vale mais: MARCA-NAO-APTO, MARCA-COTA, MARCA-DORME.
import { appendFileSync } from 'node:fs';

let entrada = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (parte) => {
  entrada += parte;
});
process.stdin.on('end', () => {
  const registro = process.env.FAKE_CLAUDE_REGISTRO;
  if (registro) {
    appendFileSync(
      registro,
      `${JSON.stringify({
        args: process.argv.slice(2),
        tamanhoDaEntrada: entrada.length,
        entradaTemFronteira: /=== IN[ÍI]CIO DO (MATERIAL|LOTE DE QUESTÕES) /.test(entrada),
        temChaveDaApi: Boolean(process.env.ANTHROPIC_API_KEY),
        cwd: process.cwd(),
      })}\n`,
    );
  }
  let modo = process.env.FAKE_CLAUDE_MODO || 'apto';
  if (entrada.includes('MARCA-NAO-APTO')) modo = 'nao_apto';
  if (entrada.includes('MARCA-COTA')) modo = 'cota';
  if (entrada.includes('MARCA-DORME')) modo = 'dorme';

  const base = {
    type: 'result',
    session_id: 'sessao-de-mentira',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 11,
      output_tokens: 222,
      cache_creation_input_tokens: 3333,
      cache_read_input_tokens: 44444,
      server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
    },
    modelUsage: {
      'claude-haiku-4-5-20251001': { inputTokens: 900, outputTokens: 9 },
      'claude-opus-5-5': { inputTokens: 11, outputTokens: 222, cacheReadInputTokens: 44444, cacheCreationInputTokens: 3333 },
    },
  };
  const responder = (extra, codigo = 0) => {
    process.stdout.write(JSON.stringify({ ...base, ...extra }));
    process.exit(codigo);
  };

  if (modo === 'dorme') {
    setTimeout(() => responder({ subtype: 'success', is_error: false, result: 'tarde demais' }), 60_000);
  } else if (modo === 'sem_json') {
    process.stdout.write('isto não é json');
    process.exit(0);
  } else if (modo === 'cota') {
    responder({ subtype: 'success', is_error: true, result: 'Claude AI usage limit reached|1760000000' }, 1);
  } else if (modo === 'falha') {
    responder({ subtype: 'error_during_execution', is_error: true, result: 'algo deu errado' }, 1);
  } else if (modo === 'nao_apto') {
    responder({
      subtype: 'success',
      is_error: false,
      result:
        '1. **Fato** — seção Primeira seção: o dado não confere com a fonte.\n\nNÃO APTO — 1 achado grave\n\n```\nCorrija o material conforme os achados abaixo, mude só o que eles pedem e entregue os dois blocos de novo (o .md inteiro e O QUE MUDEI):\n1. Dado: corrigir conforme a fonte.\n```',
    });
  } else {
    responder({ subtype: 'success', is_error: false, result: '1. Fato — seção Primeira seção: confere com as fontes.\n\nAPTO PARA ENVIAR' });
  }
});
