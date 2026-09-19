import { describe, it, expect } from 'vitest';
import { createErrorReporter, sanitizeUrl, type ClientErrorPayload } from '../../src/services/errorReporting';

// NOVO-02 — o registro de erros do cliente nunca pode vazar token da URL,
// inundar o banco nem gerar erro novo por conta própria.

function novoReporter(send: (p: ClientErrorPayload) => unknown = () => undefined) {
  const enviados: ClientErrorPayload[] = [];
  const reporter = createErrorReporter({
    send: (p) => {
      enviados.push(p);
      return send(p);
    },
    release: 'abc123',
    userAgent: 'UA-teste',
    currentUrl: () => 'https://app.exemplo/#/questions',
    maxPerSession: 3,
  });
  return { reporter, enviados };
}

describe('sanitizeUrl', () => {
  it('mantém só o caminho e a rota #/tela', () => {
    expect(sanitizeUrl('https://app.exemplo/#/questions')).toBe('/#/questions');
    expect(sanitizeUrl('https://app.exemplo/')).toBe('/');
  });

  it('descarta query string e hash com token de recuperação de senha', () => {
    expect(sanitizeUrl('https://app.exemplo/?code=segredo#/dashboard')).toBe('/#/dashboard');
    expect(sanitizeUrl('https://app.exemplo/#access_token=eyJsegredo&type=recovery')).toBe('/');
  });

  it('não lança com URL inválida', () => {
    expect(sanitizeUrl('não é url')).toBe('');
  });
});

describe('createErrorReporter', () => {
  it('envia tipo, mensagem, stack, URL sanitizada, release e user agent', () => {
    const { reporter, enviados } = novoReporter();
    const erro = new Error('Falha ao abrir a tela');
    reporter.report('boundary', erro);
    expect(enviados).toEqual([
      {
        kind: 'boundary',
        message: 'Falha ao abrir a tela',
        stack: erro.stack ?? null,
        url: '/#/questions',
        release: 'abc123',
        userAgent: 'UA-teste',
      },
    ]);
  });

  it('aceita valores que não são Error', () => {
    const { reporter, enviados } = novoReporter();
    reporter.report('unhandledrejection', 'texto solto');
    reporter.report('unhandledrejection', { motivo: 1 });
    expect(enviados.map((p) => p.message)).toEqual(['texto solto', '{"motivo":1}']);
    expect(enviados[0].stack).toBeNull();
  });

  it('não reenvia o mesmo erro na mesma sessão', () => {
    const { reporter, enviados } = novoReporter();
    reporter.report('error', new Error('igual'));
    reporter.report('error', new Error('igual'));
    reporter.report('boundary', new Error('igual'));
    expect(enviados).toHaveLength(2);
  });

  it('para de enviar depois do limite por sessão', () => {
    const { reporter, enviados } = novoReporter();
    for (let i = 0; i < 10; i += 1) reporter.report('error', new Error(`erro ${i}`));
    expect(enviados).toHaveLength(3);
  });

  it('nunca lança, mesmo se o envio falhar', async () => {
    const rejeita = novoReporter(() => Promise.reject(new Error('rede caiu')));
    expect(() => rejeita.reporter.report('error', new Error('a'))).not.toThrow();
    const lanca = novoReporter(() => {
      throw new Error('síncrono');
    });
    expect(() => lanca.reporter.report('error', new Error('b'))).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('install registra erro global e promessa rejeitada sem tratamento', () => {
    const { reporter, enviados } = novoReporter();
    const alvo = new EventTarget();
    const remover = reporter.install(alvo);

    const evErro = Object.assign(new Event('error'), { error: new Error('global'), message: 'global' });
    alvo.dispatchEvent(evErro);
    const evRej = Object.assign(new Event('unhandledrejection'), { reason: new Error('promessa') });
    alvo.dispatchEvent(evRej);

    expect(enviados.map((p) => [p.kind, p.message])).toEqual([
      ['error', 'global'],
      ['unhandledrejection', 'promessa'],
    ]);

    remover();
    alvo.dispatchEvent(Object.assign(new Event('error'), { error: new Error('depois') }));
    expect(enviados).toHaveLength(2);
  });

  it('ignora erro de carregamento de recurso (evento sem objeto de erro)', () => {
    const { reporter, enviados } = novoReporter();
    const alvo = new EventTarget();
    reporter.install(alvo);
    alvo.dispatchEvent(new Event('error'));
    expect(enviados).toHaveLength(0);
  });
});
