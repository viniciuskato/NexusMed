import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recusaDefinitiva } from '../../supabase/functions/revisar-envios/ciclo.ts';
import { BASE_DO_REVISOR } from '../../supabase/functions/revisar-envios/gerado/textos.ts';
import { montarPedidoDeLote, montarSistema } from '../../supabase/functions/revisar-envios/montagem.ts';
import { lerVeredito, textoFinalDaResposta } from '../../supabase/functions/revisar-envios/veredito.ts';
import {
  FalhaDoClaude,
  LEMBRETE_DE_FECHAMENTO,
  LIMITE_DE_TEMPOS_ESGOTADOS,
  LIMITE_DA_LINHA_DE_COMANDO,
  ambienteDoClaude,
  apiViaClaude,
  chaveDoPedido,
  claudeDaExtensao,
  contadorEmArquivo,
  lerSaidaDoClaude,
  localizarClaude,
  perguntarAoClaude,
  prepararChamada,
  tamanhoDaLinhaDeComando,
  type OpcoesDoClaude,
  type RespostaDoClaude,
} from '../../scripts/revisor-local/claude.ts';

// D-12 — o `claude -p` no lugar da API de lotes, com um `claude` de mentira
// (tests/unit/helpers/claudeDeMentira.mjs). Nenhuma chamada real.

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FALSO = path.join(AQUI, 'helpers', 'claudeDeMentira.mjs');
let pasta: string;

beforeAll(() => {
  pasta = mkdtempSync(path.join(tmpdir(), 'revisor-claude-'));
});
afterAll(() => {
  rmSync(pasta, { recursive: true, force: true });
});

function tocar(arquivo: string): string {
  mkdirSync(path.dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, '');
  return arquivo;
}

function opcoes(extra: Partial<OpcoesDoClaude> = {}): OpcoesDoClaude {
  return { exe: process.execPath, argsIniciais: [FALSO], pastaNeutra: path.join(pasta, 'neutra'), timeoutMs: 20_000, ...extra };
}

describe('onde está o claude', () => {
  it('acha a versão MAIS NOVA da extensão do VS Code (comparando como número, não como texto)', () => {
    const ext = path.join(pasta, 'ext1');
    for (const v of ['2.1.9', '2.1.288', '2.1.10', '2.0.999']) {
      tocar(path.join(ext, `anthropic.claude-code-${v}-win32-x64`, 'resources', 'native-binary', 'claude.exe'));
    }
    // Pasta sem o executável e pastas de outras extensões/plataformas não valem.
    mkdirSync(path.join(ext, 'anthropic.claude-code-9.9.9-win32-x64'), { recursive: true });
    tocar(path.join(ext, 'anthropic.claude-code-9.9.9-linux-x64', 'resources', 'native-binary', 'claude.exe'));
    tocar(path.join(ext, 'outra.extensao-3.0.0-win32-x64', 'resources', 'native-binary', 'claude.exe'));
    expect(claudeDaExtensao(ext)).toBe(path.join(ext, 'anthropic.claude-code-2.1.288-win32-x64', 'resources', 'native-binary', 'claude.exe'));
    expect(claudeDaExtensao(path.join(pasta, 'nao-existe'))).toBeNull();
  });

  it('REVISOR_CLAUDE vence; depois a extensão; depois o PATH', () => {
    const casa = path.join(pasta, 'casa');
    const doPath = tocar(path.join(pasta, 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude'));
    const extensao = tocar(path.join(casa, '.vscode', 'extensions', 'anthropic.claude-code-2.1.1-win32-x64', 'resources', 'native-binary', 'claude.exe'));
    const explicito = tocar(path.join(pasta, 'explicito', 'claude.exe'));
    const env = { PATH: path.join(pasta, 'bin') } as NodeJS.ProcessEnv;
    expect(localizarClaude({ ...env, REVISOR_CLAUDE: explicito }, casa)).toBe(explicito);
    expect(localizarClaude({ ...env, REVISOR_CLAUDE: path.join(pasta, 'nao-existe.exe') }, casa)).toBeNull();
    expect(localizarClaude(env, casa)).toBe(extensao);
    expect(localizarClaude(env, path.join(pasta, 'casa-sem-extensao'))).toBe(doPath);
    expect(localizarClaude({ PATH: '' } as NodeJS.ProcessEnv, path.join(pasta, 'casa-sem-extensao'))).toBeNull();
  });
});

describe('como o claude é chamado', () => {
  const pergunta = { sistema: 'SISTEMA', mensagem: 'MENSAGEM' };

  it('só julga: sem ferramentas, sem pular permissões, sem sessão em disco, com opus', () => {
    const preparo = prepararChamada(pergunta, { exe: 'claude.exe' });
    if (!preparo.ok) throw new Error('esperava uma chamada pronta');
    const { args, entrada, sistemaEmArquivo } = preparo;
    expect(entrada).toBe('MENSAGEM');
    expect(sistemaEmArquivo).toBeNull();
    expect(args).toContain('-p');
    expect(args[args.indexOf('--model') + 1]).toBe('opus');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args[args.indexOf('--system-prompt') + 1]).toBe('SISTEMA');
    expect(args[args.indexOf('--output-format') + 1]).toBe('json');
    expect(args[args.indexOf('--effort') + 1]).toBe('medium');
    expect(args).toContain('--no-session-persistence');
    expect(args).toContain('--safe-mode');
    const junto = args.join(' ');
    expect(junto).not.toMatch(/dangerously|skip-permissions|bypass|allowedTools|--settings|--add-dir|--mcp/i);
  });

  it('com --web libera só a busca e a leitura de página da web, e nada além', () => {
    const preparo = prepararChamada(pergunta, { exe: 'claude.exe', web: true });
    if (!preparo.ok) throw new Error('esperava uma chamada pronta');
    const { args } = preparo;
    expect(args[args.indexOf('--tools') + 1]).toBe('WebSearch,WebFetch');
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('WebSearch,WebFetch');
    expect(args.join(' ')).not.toMatch(/Bash|Edit|Write|Read|dangerously/);
  });

  it('o prompt revisor de verdade cabe na linha de comando do Windows, com folga conhecida', () => {
    const sistema = montarSistema(BASE_DO_REVISOR);
    const preparo = prepararChamada({ sistema, mensagem: 'x' }, { exe: 'C:/x/claude.exe', plataforma: 'win32' });
    if (!preparo.ok) throw new Error('esperava uma chamada pronta');
    const { args, sistemaEmArquivo } = preparo;
    expect(sistemaEmArquivo).toBeNull();
    expect(tamanhoDaLinhaDeComando('C:/x/claude.exe', args)).toBeLessThanOrEqual(LIMITE_DA_LINHA_DE_COMANDO);
  });

  it('prompt grande demais para a linha de comando do Windows vai por --system-prompt-file, nunca misturado à mensagem', () => {
    const grande = `${'"aspas" '.repeat(5000)}fim`;
    const preparo = prepararChamada({ sistema: grande, mensagem: 'MENSAGEM' }, { exe: 'claude.exe', plataforma: 'win32', arquivoDoSistema: 'C:/tmp/sistema.txt' });
    if (!preparo.ok) throw new Error('esperava uma chamada pronta');
    expect(preparo.args).not.toContain('--system-prompt');
    expect(preparo.args[preparo.args.indexOf('--system-prompt-file') + 1]).toBe('C:/tmp/sistema.txt');
    expect(preparo.args[preparo.args.indexOf('--tools') + 1]).toBe('');
    expect(preparo.sistemaEmArquivo).toEqual({ caminho: 'C:/tmp/sistema.txt', conteudo: grande });
    // A entrada é SÓ a mensagem (o material do envio): as instruções nunca vão junto.
    expect(preparo.entrada).toBe('MENSAGEM');
    expect(preparo.args.join(' ')).not.toContain('aspas');
    // Fora do Windows o limite é outro: continua como argumento.
    const linux = prepararChamada({ sistema: grande, mensagem: 'M' }, { exe: 'claude', plataforma: 'linux' });
    expect(linux.ok && linux.sistemaEmArquivo === null && linux.args.includes('--system-prompt')).toBe(true);
  });

  it('prompt grande demais e sem arquivo para ele: falha fechada, sem montar chamada nem misturar instruções e mensagem', () => {
    const grande = `${'"aspas" '.repeat(5000)}fim`;
    const preparo = prepararChamada({ sistema: grande, mensagem: 'MENSAGEM' }, { exe: 'claude.exe', plataforma: 'win32' });
    expect(preparo).toEqual({ ok: false, motivo: expect.stringMatching(/não cabe na linha de comando/) });
  });

  it('nunca repassa ao claude as variáveis que o fariam cobrar de uma API paga', () => {
    const env = ambienteDoClaude({
      PATH: 'x',
      ANTHROPIC_API_KEY: 'segredo',
      ANTHROPIC_AUTH_TOKEN: 't',
      ANTHROPIC_BASE_URL: 'u',
      CLAUDE_CODE_USE_BEDROCK: '1',
      CLAUDE_CODE_USE_VERTEX: '1',
      CLAUDE_CODE_USE_FOUNDRY: '1',
    });
    expect(env).toEqual({ PATH: 'x' });
  });
});

describe('leitura da saída do claude', () => {
  const sucesso = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn',
      result: 'achados\n\nAPTO PARA ENVIAR',
      usage: { input_tokens: 2, output_tokens: 3, cache_creation_input_tokens: 4, cache_read_input_tokens: 5, server_tool_use: { web_search_requests: 6, web_fetch_requests: 7 } },
      modelUsage: { 'claude-haiku-4-5': { inputTokens: 900, outputTokens: 9 }, 'claude-opus-5-5': { inputTokens: 2, outputTokens: 3, cacheCreationInputTokens: 4000 } },
      ...extra,
    });

  it('vira a mensagem que a coleta da Edge Function já lê, com o uso e o modelo que mais trabalhou', () => {
    const r = lerSaidaDoClaude(sucesso(), 0);
    expect(r).toEqual({
      ok: true,
      mensagem: {
        stop_reason: 'end_turn',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: 'achados\n\nAPTO PARA ENVIAR' }],
        usage: {
          input_tokens: 2, output_tokens: 3, cache_creation_input_tokens: 4, cache_read_input_tokens: 5,
          server_tool_use: { web_search_requests: 6, web_fetch_requests: 7 },
        },
      },
    });
    if (!r.ok) throw new Error('esperava sucesso');
    // E o veredito sai pela mesma leitura da Edge Function.
    expect(lerVeredito({ stopReason: r.mensagem.stop_reason, texto: textoFinalDaResposta(r.mensagem.content) })).toMatchObject({
      veredito: 'apto',
      achados: 'achados',
    });
  });

  it('erro, cota esgotada, saída que não é JSON e código de saída diferente de 0 são falhas técnicas, nunca veredito', () => {
    expect(lerSaidaDoClaude(sucesso({ is_error: true, result: 'Claude AI usage limit reached|1760000000' }), 1)).toEqual({
      ok: false, tipo: 'cota', detalhe: 'Claude AI usage limit reached|1760000000',
    });
    expect(lerSaidaDoClaude(sucesso({ is_error: true, result: 'Algo quebrou' }), 1)).toMatchObject({ ok: false, tipo: 'processo' });
    expect(lerSaidaDoClaude(sucesso({ subtype: 'error_max_turns' }), 0)).toMatchObject({ ok: false, tipo: 'processo' });
    expect(lerSaidaDoClaude(sucesso(), 3)).toMatchObject({ ok: false, tipo: 'processo' });
    expect(lerSaidaDoClaude(sucesso(), null)).toMatchObject({ ok: false, tipo: 'processo' });
    expect(lerSaidaDoClaude('isto não é json', 0)).toMatchObject({ ok: false, tipo: 'processo' });
  });

  it('resposta cortada (stop_reason diferente de end_turn) segue para a leitura de sempre, que a trata como erro', () => {
    const r = lerSaidaDoClaude(sucesso({ stop_reason: 'max_tokens' }), 0);
    if (!r.ok) throw new Error('esperava sucesso');
    expect(lerVeredito({ stopReason: r.mensagem.stop_reason, texto: textoFinalDaResposta(r.mensagem.content) }).veredito).toBe('erro');
  });
});

describe('o processo do claude (script de mentira)', () => {
  it('manda a mensagem pela entrada, roda na pasta neutra e NÃO leva a chave da API ao claude', async () => {
    const registro = path.join(pasta, 'registro1.jsonl');
    process.env.FAKE_CLAUDE_REGISTRO = registro;
    process.env.ANTHROPIC_API_KEY = 'chave-que-nao-pode-chegar';
    try {
      const perguntar = perguntarAoClaude(opcoes());
      const r = await perguntar({ sistema: 'SISTEMA', mensagem: '=== INÍCIO DO MATERIAL abc ===\ntexto\n=== FIM DO MATERIAL abc ===' });
      expect(r.ok).toBe(true);
      const visto = JSON.parse(readFileSync(registro, 'utf8').trim().split('\n')[0]);
      expect(visto.entradaTemFronteira).toBe(true);
      expect(visto.temChaveDaApi).toBe(false);
      expect(visto.args).toEqual(expect.arrayContaining(['-p', '--model', 'opus', '--tools', '', '--safe-mode']));
      expect(path.resolve(visto.cwd).toLowerCase()).toBe(path.resolve(pasta, 'neutra').toLowerCase());
    } finally {
      delete process.env.FAKE_CLAUDE_REGISTRO;
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('prompt de sistema grande: o claude recebe --system-prompt-file com o arquivo gravado e a entrada só traz a mensagem; o arquivo some depois', async () => {
    const registro = path.join(pasta, 'registro-sistema.jsonl');
    const temporaria = path.join(pasta, 'temporaria');
    mkdirSync(temporaria, { recursive: true });
    process.env.FAKE_CLAUDE_REGISTRO = registro;
    try {
      const grande = `INSTRUCOES ${'"aspas" '.repeat(5000)}fim`;
      const perguntar = perguntarAoClaude(opcoes({ plataforma: 'win32', pastaTemporaria: temporaria }));
      const mensagem = ['=== INÍCIO DO MATERIAL abc ===', 'texto', '=== FIM DO MATERIAL abc ==='].join('\n');
      const r = await perguntar({ sistema: grande, mensagem });
      expect(r.ok).toBe(true);
      const visto = JSON.parse(readFileSync(registro, 'utf8').trim().split('\n')[0]);
      expect(visto.args).not.toContain('--system-prompt');
      expect(visto.args).toContain('--system-prompt-file');
      expect(visto.sistemaDoArquivo).toEqual({ tamanho: grande.length, comecaCom: 'INSTRUCOES' });
      expect(visto.tamanhoDaEntrada).toBe(mensagem.length);
      expect(visto.entradaTemInstrucoes).toBe(false);
      // Nada fica no disco depois da chamada.
      expect(readdirSync(temporaria)).toEqual([]);
    } finally {
      delete process.env.FAKE_CLAUDE_REGISTRO;
    }
  });

  it('prompt de sistema grande e sem onde gravar o arquivo: falha fechada, o claude nem é executado', async () => {
    const registro = path.join(pasta, 'registro-sem-arquivo.jsonl');
    const naoEPasta = path.join(pasta, 'arquivo-no-lugar-da-pasta');
    writeFileSync(naoEPasta, '');
    process.env.FAKE_CLAUDE_REGISTRO = registro;
    try {
      const grande = `${'"aspas" '.repeat(5000)}fim`;
      const perguntar = perguntarAoClaude(opcoes({ plataforma: 'win32', pastaTemporaria: naoEPasta }));
      const r = await perguntar({ sistema: grande, mensagem: 'MENSAGEM' });
      expect(r).toMatchObject({ ok: false, tipo: 'processo' });
      expect(existsSync(registro)).toBe(false);
    } finally {
      delete process.env.FAKE_CLAUDE_REGISTRO;
    }
  });

  it('cota esgotada, falha e saída ilegível voltam como falha técnica', async () => {
    const perguntar = perguntarAoClaude(opcoes());
    expect(await perguntar({ sistema: 's', mensagem: 'MARCA-COTA' })).toMatchObject({ ok: false, tipo: 'cota' });
    process.env.FAKE_CLAUDE_MODO = 'falha';
    expect(await perguntar({ sistema: 's', mensagem: 'x' })).toMatchObject({ ok: false, tipo: 'processo' });
    process.env.FAKE_CLAUDE_MODO = 'sem_json';
    expect(await perguntar({ sistema: 's', mensagem: 'x' })).toMatchObject({ ok: false, tipo: 'processo' });
    delete process.env.FAKE_CLAUDE_MODO;
  });

  it('claude que não responde no prazo é encerrado (só o PID que o programa iniciou) e conta como tempo esgotado', async () => {
    const perguntar = perguntarAoClaude(opcoes({ timeoutMs: 600 }));
    const inicio = Date.now();
    const r = await perguntar({ sistema: 's', mensagem: 'MARCA-DORME' });
    expect(r).toMatchObject({ ok: false, tipo: 'tempo' });
    expect(Date.now() - inicio).toBeLessThan(10_000);
  });

  it('executável que não existe é falha técnica, sem lançar exceção', async () => {
    const perguntar = perguntarAoClaude({ exe: path.join(pasta, 'nao-existe.exe'), pastaNeutra: path.join(pasta, 'neutra'), timeoutMs: 5000 });
    expect(await perguntar({ sistema: 's', mensagem: 'x' })).toMatchObject({ ok: false, tipo: 'processo' });
  });
});

describe('o contador de tempos esgotados', () => {
  it('guarda só a chave e a contagem, expira em 7 dias e ignora arquivo estragado', () => {
    const arq = path.join(pasta, 'contador', 'falhas.json');
    let agora = 1_000_000;
    const c = contadorEmArquivo(arq, () => agora);
    expect(c.tempos('a')).toBe(0);
    expect(c.registrarTempo('a')).toBe(1);
    expect(c.registrarTempo('a')).toBe(2);
    expect(c.tempos('a')).toBe(2);
    expect(readFileSync(arq, 'utf8')).toBe('{"a":{"n":2,"em":1000000}}');
    c.limpar('a');
    expect(c.tempos('a')).toBe(0);
    c.registrarTempo('b');
    agora += 8 * 24 * 60 * 60 * 1000;
    expect(c.tempos('b')).toBe(0);
    writeFileSync(arq, '{ estragado');
    expect(c.tempos('b')).toBe(0);
    expect(c.registrarTempo('b')).toBe(1);
  });
});

describe('o adaptador (claude no lugar da API de lotes)', () => {
  const sistema = montarSistema(BASE_DO_REVISOR);
  const pedido = (n: number, codigo: string, texto = 'texto do material') =>
    montarPedidoDeLote({
      reviewId: `rev-${n}`,
      sistema,
      material: { titulo: 'Título', disciplina: 'D', tema: 'T', pai: null, texto },
      codigo,
    });
  const ok = (texto: string): RespostaDoClaude => ({
    ok: true,
    mensagem: { stop_reason: 'end_turn', content: [{ type: 'text', text: texto }], usage: { input_tokens: 1, output_tokens: 1 } },
  });
  const COD1 = '11111111-1111-4111-8111-111111111111';
  const COD2 = '22222222-2222-4222-8222-222222222222';

  it('o claude recebe o MESMO sistema e a mensagem que a API de lotes receberia, mais o lembrete de fechamento no fim', async () => {
    const vistos: Array<{ sistema: string; mensagem: string }> = [];
    const api = apiViaClaude({
      perguntar: async (p) => {
        vistos.push(p);
        return ok('APTO PARA ENVIAR');
      },
      falhas: contadorEmArquivo(path.join(pasta, 'a1.json')),
    });
    const p = pedido(1, COD1);
    const { id } = await api.criar([p]);
    expect(vistos).toHaveLength(1);
    expect(vistos[0].sistema).toBe(sistema);
    expect(vistos[0].mensagem).toBe(`${p.params.messages[0].content as string}\n\n${LEMBRETE_DE_FECHAMENTO}`);
    // O lembrete fica fora das fronteiras do material.
    expect(vistos[0].mensagem.indexOf(LEMBRETE_DE_FECHAMENTO)).toBeGreaterThan(vistos[0].mensagem.indexOf('=== FIM DO MATERIAL'));
    expect(await api.consultar(id)).toEqual({ status: 'ended' });
    const itens: Array<{ custom_id: string; result: { type: string } }> = [];
    for await (const item of api.resultados(id)) itens.push(item);
    expect(itens.map((i) => [i.custom_id, i.result.type])).toEqual([['rev-1', 'succeeded']]);
    // Um lote só é lido uma vez; depois ele não existe mais.
    await expect(api.consultar(id)).rejects.toMatchObject({ status: 404 });
    expect(await api.listar('2026-01-01T00:00:00Z')).toEqual([]);
  });

  it('falha técnica do claude vira recusa definitiva (o envio volta à fila sem contar) e fica registrada', async () => {
    const api = apiViaClaude({
      perguntar: async () => ({ ok: false, tipo: 'cota', detalhe: 'limite' }),
      falhas: contadorEmArquivo(path.join(pasta, 'a2.json')),
    });
    expect(api.falhaTecnica()).toBeNull();
    const e = await api.criar([pedido(1, COD1)]).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(FalhaDoClaude);
    expect(recusaDefinitiva(e)).toBe(true);
    expect(api.falhaTecnica()?.tipo).toBe('cota');
  });

  it('tempo esgotado repetido com o MESMO conteúdo (mesmo com outro código de fronteira) para de gastar a cota e manda o envio a "erro"', async () => {
    let chamadas = 0;
    const falhas = contadorEmArquivo(path.join(pasta, 'a3.json'));
    const api = apiViaClaude({
      perguntar: async () => {
        chamadas += 1;
        return { ok: false, tipo: 'tempo', detalhe: 'sem resposta' };
      },
      falhas,
    });
    for (let i = 0; i < LIMITE_DE_TEMPOS_ESGOTADOS; i += 1) {
      await expect(api.criar([pedido(i, i % 2 ? COD1 : COD2)])).rejects.toBeInstanceOf(FalhaDoClaude);
    }
    expect(chamadas).toBe(LIMITE_DE_TEMPOS_ESGOTADOS);
    const { id } = await api.criar([pedido(9, '33333333-3333-4333-8333-333333333333')]);
    expect(chamadas).toBe(LIMITE_DE_TEMPOS_ESGOTADOS);
    const itens: Array<{ result: { type: string } }> = [];
    for await (const item of api.resultados(id)) itens.push(item);
    expect(itens[0].result.type).toBe('errored');
    // Outro conteúdo não é afetado.
    await expect(api.criar([pedido(10, COD1, 'outro texto')])).rejects.toBeInstanceOf(FalhaDoClaude);
    expect(chamadas).toBe(LIMITE_DE_TEMPOS_ESGOTADOS + 1);
  });

  it('a chave do pedido ignora o código de fronteira, mas muda com o texto e com o sistema', () => {
    const m1 = pedido(1, COD1).params.messages[0].content as string;
    const m2 = pedido(2, COD2).params.messages[0].content as string;
    expect(m1).not.toBe(m2);
    expect(chaveDoPedido(sistema, m1)).toBe(chaveDoPedido(sistema, m2));
    expect(chaveDoPedido(sistema, m1)).not.toBe(chaveDoPedido(sistema, pedido(1, COD1, 'outro').params.messages[0].content as string));
    expect(chaveDoPedido(sistema, m1)).not.toBe(chaveDoPedido('outro sistema', m1));
  });
});
