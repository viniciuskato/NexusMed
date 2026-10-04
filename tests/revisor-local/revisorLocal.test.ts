import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_DO_REVISOR, BASE_DO_REVISOR_DE_QUESTOES } from '../../supabase/functions/revisar-envios/gerado/textos.ts';
import { montarSistema, montarSistemaDeQuestoes } from '../../supabase/functions/revisar-envios/montagem.ts';
import { sha256Hex } from '../../supabase/functions/revisar-envios/seguranca.ts';
import { lerVeredito } from '../../supabase/functions/revisar-envios/veredito.ts';
import { SQL_DA_FILA, clienteDoBanco, executorViaCli } from '../../scripts/revisor-local/banco-cli.ts';
import { contadorEmArquivo, perguntarAoClaude } from '../../scripts/revisor-local/claude.ts';
import { executarRodada, type DepsDaRodada, type ResumoDaRodada } from '../../scripts/revisor-local/rodada.ts';
import {
  MATERIAL_PREFIX,
  createTestUser,
  deleteE2EMaterials,
  deleteTestUser,
  getLocalConfig,
  getSeedIds,
  insertPublishedMaterial,
  psqlLocal,
  runCleanup,
  type CreatedTestUser,
} from '../e2e/fixtures/localSupabase';
import { materialParaEnvio } from '../e2e/fixtures/materialParaEnvio';
import { loteParaEnvio } from '../e2e/fixtures/questoesParaEnvio';

// D-12/P7 — o revisor local (que só ACONSELHA: nada é publicado nem aplicado por ele) de ponta a ponta contra o Supabase LOCAL (nunca o remoto), com o `claude` SIMULADO
// (tests/unit/helpers/claudeDeMentira.mjs, rodado como processo de verdade). A ponte com o banco é a real:
// `supabase db query --local` chamando as funções `revisao_*`. O estado final é conferido no banco.
//
// Como rodar (com a vez do banco local, ver EXECUTOR_PROTOCOL.md): `supabase db reset` e depois
// `npm.cmd run test:revisor-local`.

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FALSO = path.resolve(AQUI, '..', 'unit', 'helpers', 'claudeDeMentira.mjs');
const SUPABASE = process.env.REVISOR_SUPABASE ?? (existsSync(path.join(homedir(), 'bin', 'supabase.exe')) ? path.join(homedir(), 'bin', 'supabase.exe') : 'supabase');

// As respostas do claude de mentira (iguais às do script) e o que a Edge Function gravaria para elas.
const TEXTO_APTO = '1. Fato — seção Primeira seção: confere com as fontes.\n\nAPTO PARA ENVIAR';
const TEXTO_NAO_APTO =
  '1. **Fato** — seção Primeira seção: o dado não confere com a fonte.\n\nNÃO APTO — 1 achado grave\n\n```\nCorrija o material conforme os achados abaixo, mude só o que eles pedem e entregue os dois blocos de novo (o .md inteiro e O QUE MUDEI):\n1. Dado: corrigir conforme a fonte.\n```';

const q = (s: string) => s.replace(/'/g, "''");
const um = (sql: string) => psqlLocal(sql).split('\n')[0].trim();

let pasta: string;
let registroDoClaude: string;
let exec: ReturnType<typeof executorViaCli>;
let seed: ReturnType<typeof getSeedIds>;
let disciplina: string;
let tema: string;
let limpeza: Array<() => Promise<void> | void> = [];
let tituloDoMaterial = '';
let materialId = '';

const tag = `${Date.now()}`;

/** Quem envia é o admin (P6). `student` só para os envios antigos de outras pessoas, que ainda guardam os limites. */
async function autor(prefixo: string, role: 'admin' | 'student' = 'admin'): Promise<CreatedTestUser> {
  const u = await createTestUser({ emailLocalPart: `rl-${prefixo}-${tag}`, password: 'senha-teste-123', role, status: 'active' });
  limpeza.push(() => deleteTestUser(u.id));
  limpeza.unshift(() => apagarQuestoesPublicadasDe(u.id));
  return u;
}

/** As questões que o servidor publicou saem do ar e são apagadas antes do autor (só o postgres apaga questão publicada). */
function apagarQuestoesPublicadasDe(userId: string): void {
  const ids = `(select unnest(published_question_ids) from public.question_submissions where author_id = '${userId}')`;
  psqlLocal(`update public.questions set status = 'draft' where id in ${ids} and status = 'published';`);
  psqlLocal(`delete from public.question_materials where question_id in ${ids};`);
  psqlLocal(`delete from public.questions where id in ${ids};`);
}

function envioDeMaterial(autorId: string, titulo: string, texto: string): string {
  return um(
    `insert into public.material_submissions (author_id, title, discipline_id, theme_id, content_md) values ('${autorId}', '${q(titulo)}', '${seed.disciplineId}', '${seed.themeId}', '${q(texto)}') returning id;`,
  );
}

function envioDeQuestoes(autorId: string, nome: string, texto: string): string {
  return um(`insert into public.question_submissions (author_id, title, content_md) values ('${autorId}', '${q(nome)}', '${q(texto)}') returning id;`);
}

function statusDoEnvio(tabela: 'material_submissions' | 'question_submissions', id: string): string {
  return um(`select status from public.${tabela} where id = '${id}';`);
}

interface Revisao {
  status: string;
  verdict: string;
  verdict_line: string | null;
  findings_text: string | null;
  correction_block: string | null;
  error_kind: string | null;
  batch_id: string | null;
  model: string | null;
  prompt_sha256: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  web_searches: number;
  web_fetches: number;
  stop_reason: string | null;
  billable: boolean;
}

function revisaoDe(coluna: 'submission_id' | 'question_submission_id', id: string): Revisao {
  const json = um(
    `select row_to_json(r)::text from (select status, verdict, verdict_line, findings_text, correction_block, error_kind, batch_id, model, prompt_sha256, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, web_searches, web_fetches, stop_reason, billable from public.material_reviews where ${coluna} = '${id}' order by created_at desc limit 1) r;`,
  );
  return JSON.parse(json) as Revisao;
}

function chamadasAoClaude(): Array<{ args: string[]; entradaTemFronteira: boolean }> {
  const texto = existsSync(registroDoClaude) ? readFileSync(registroDoClaude, 'utf8').trim() : '';
  return texto === '' ? [] : texto.split('\n').map((l) => JSON.parse(l));
}

async function rodar(extra: Partial<DepsDaRodada> = {}): Promise<{ resumo: ResumoDaRodada; linhas: string[] }> {
  const linhas: string[] = [];
  const resumo = await executarRodada({
    exec,
    perguntar: perguntarAoClaude({ exe: process.execPath, argsIniciais: [FALSO], pastaNeutra: path.join(pasta, 'neutra'), timeoutMs: 60_000, web: true }),
    claudeDisponivel: true,
    falhas: contadorEmArquivo(path.join(pasta, 'falhas.json')),
    registrar: (l) => linhas.push(l),
    rotuloDoAlvo: 'LOCAL',
    ...extra,
  });
  return { resumo, linhas };
}

beforeAll(async () => {
  // Trava dupla de "só local": getLocalConfig recusa qualquer URL que não seja 127.0.0.1/localhost, e o
  // executor deste teste só sabe falar com `--local`.
  getLocalConfig();
  pasta = mkdtempSync(path.join(tmpdir(), 'revisor-local-it-'));
  registroDoClaude = path.join(pasta, 'claude.jsonl');
  process.env.FAKE_CLAUDE_REGISTRO = registroDoClaude;
  exec = executorViaCli({ alvo: 'local', supabase: SUPABASE, projeto: process.cwd() });
  seed = getSeedIds();
  // O material publicado que as questões citam e que a atualização mira (publicado pelo admin, como o dono faz).
  materialId = insertPublishedMaterial(`rl-${tag}`, seed);
  tituloDoMaterial = `${MATERIAL_PREFIX}rl-${tag}`;
  disciplina = um(`select name from public.disciplines where id = '${seed.disciplineId}';`);
  tema = um(`select name from public.themes where id = '${seed.themeId}';`);
  const fila = await exec(SQL_DA_FILA);
  if (Number(fila[0]?.n) !== 0) {
    throw new Error('A fila de envios do banco local não está vazia: rode `supabase db reset` (com a vez do banco local) antes deste teste.');
  }
});

afterAll(async () => {
  delete process.env.FAKE_CLAUDE_REGISTRO;
  delete process.env.FAKE_CLAUDE_MODO;
  const fns = [...limpeza, () => deleteE2EMaterials()];
  limpeza = [];
  rmSync(pasta, { recursive: true, force: true });
  await runCleanup(fns);
});

describe('material novo', () => {
  it('apto: o claude simulado é chamado uma vez, o veredito chega igual ao que a Edge Function gravaria, e NADA é publicado', async () => {
    const a = await autor('apto');
    const titulo = `${MATERIAL_PREFIX}rl-apto-${tag}`;
    const envio = envioDeMaterial(a.id, titulo, materialParaEnvio({ titulo, disciplina, tema }));
    expect(statusDoEnvio('material_submissions', envio)).toBe('aguardando_revisao');
    const materiaisAntes = um(`select count(*) from public.materials;`);

    const { resumo, linhas } = await rodar();

    expect(resumo).toMatchObject({ fila: 'com trabalho', ciclos: 2, chamadasAoClaude: 1, falha: null });
    expect(resumo.totais).toMatchObject({ enviados: 1, resultados: 1, reprovadosAntesDaIa: 0 });
    const chamadas = chamadasAoClaude();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].entradaTemFronteira).toBe(true);
    // A busca e a leitura de página da web estão ligadas (padrão da P7), e só elas.
    expect(chamadas[0].args[chamadas[0].args.indexOf('--tools') + 1]).toBe('WebSearch,WebFetch');

    // O veredito gravado é o que `lerVeredito` (o código da Edge Function) tira do texto do claude.
    const esperado = lerVeredito({ stopReason: 'end_turn', texto: TEXTO_APTO });
    const r = revisaoDe('submission_id', envio);
    expect(r).toMatchObject({
      status: 'concluida',
      verdict: esperado.veredito,
      verdict_line: esperado.linhaDoVeredito,
      findings_text: esperado.achados,
      correction_block: esperado.blocoDeCorrecao,
      error_kind: null,
      model: 'claude-opus-5-5',
      prompt_sha256: await sha256Hex(montarSistema(BASE_DO_REVISOR)),
      input_tokens: 11,
      output_tokens: 222,
      cache_creation_tokens: 3333,
      cache_read_tokens: 44444,
      web_searches: 0,
      web_fetches: 0,
      stop_reason: 'end_turn',
      billable: true,
    });
    expect(r.verdict).toBe('apto');
    expect(r.batch_id).toMatch(/^local-/);

    // Estado final: o envio fica "apto" (o parecer), sem material criado nem publicado: quem publica é o dono, pelo admin.
    expect(statusDoEnvio('material_submissions', envio)).toBe('apto');
    expect(um(`select (published_material_id is null)::text from public.material_submissions where id = '${envio}';`)).toBe('true');
    expect(um(`select count(*) from public.materials;`)).toBe(materiaisAntes);
    expect(um(`select count(*) from public.material_ai_provenance;`)).toBe('0');

    // Rodar de novo não faz nada: o envio "apto" não é fila do revisor.
    const antes = chamadasAoClaude().length;
    const outra = await rodar();
    expect(outra.resumo.fila).toBe('vazia');
    expect(chamadasAoClaude()).toHaveLength(antes);

    // O registro da rodada não leva o texto nem o título do envio.
    const registro = linhas.join('\n');
    expect(registro).not.toContain(titulo);
    expect(registro).not.toContain('Texto de exemplo');
  });

  it('não apto: o veredito e o bloco de correção chegam iguais, e nada é publicado', async () => {
    const a = await autor('naoapto');
    const titulo = `${MATERIAL_PREFIX}rl-nao-${tag}`;
    const texto = materialParaEnvio({ titulo, disciplina, tema, corpo: 'Texto de exemplo MARCA-NAO-APTO com citação [1](#ref-1) e outra [2](#ref-2).' });
    const envio = envioDeMaterial(a.id, titulo, texto);
    const antes = chamadasAoClaude().length;

    const { resumo } = await rodar();

    expect(resumo).toMatchObject({ falha: null, chamadasAoClaude: 1 });
    expect(chamadasAoClaude()).toHaveLength(antes + 1);
    const esperado = lerVeredito({ stopReason: 'end_turn', texto: TEXTO_NAO_APTO });
    expect(esperado.veredito).toBe('nao_apto');
    expect(revisaoDe('submission_id', envio)).toMatchObject({
      status: 'concluida',
      verdict: 'nao_apto',
      verdict_line: esperado.linhaDoVeredito,
      findings_text: esperado.achados,
      correction_block: esperado.blocoDeCorrecao,
      billable: true,
    });
    expect(statusDoEnvio('material_submissions', envio)).toBe('nao_apto');
    expect(um(`select (published_material_id is null)::text from public.material_submissions where id = '${envio}';`)).toBe('true');
    expect(um(`select count(*) from public.materials where title = '${q(titulo)}';`)).toBe('0');
  });

  it('arquivo fora do padrão nem chega ao claude: "não apto" sem custo, como a Edge Function faz', async () => {
    const a = await autor('foradopadrao');
    const envio = envioDeMaterial(a.id, `${MATERIAL_PREFIX}rl-fora-${tag}`, '# Só um título, sem nada do padrão');
    const antes = chamadasAoClaude().length;

    const { resumo } = await rodar();

    expect(resumo.totais.reprovadosAntesDaIa).toBe(1);
    expect(chamadasAoClaude()).toHaveLength(antes);
    expect(revisaoDe('submission_id', envio)).toMatchObject({ status: 'concluida', verdict: 'nao_apto', error_kind: 'pre_checagem', billable: false, model: null });
    expect(statusDoEnvio('material_submissions', envio)).toBe('nao_apto');
  });
});

describe('questões', () => {
  it('lote apto: o parecer fica gravado e nenhuma questão é criada nem publicada', async () => {
    const a = await autor('questoes');
    const nome = `Lote RL ${tag}`;
    const texto = loteParaEnvio(2, { disciplina, tema, materiais: tituloDoMaterial });
    const envio = envioDeQuestoes(a.id, nome, texto);
    const questoesAntes = um(`select count(*) from public.questions;`);

    const { resumo } = await rodar();

    expect(resumo).toMatchObject({ falha: null, chamadasAoClaude: 1 });
    const esperado = lerVeredito({ stopReason: 'end_turn', texto: TEXTO_APTO });
    expect(revisaoDe('question_submission_id', envio)).toMatchObject({
      status: 'concluida',
      verdict: 'apto',
      verdict_line: esperado.linhaDoVeredito,
      findings_text: esperado.achados,
      prompt_sha256: await sha256Hex(montarSistemaDeQuestoes(BASE_DO_REVISOR_DE_QUESTOES)),
    });
    expect(statusDoEnvio('question_submissions', envio)).toBe('apto');
    expect(um(`select coalesce(cardinality(published_question_ids), 0) from public.question_submissions where id = '${envio}';`)).toBe('0');
    expect(um(`select count(*) from public.questions;`)).toBe(questoesAntes);
  });
});

describe('atualização de material', () => {
  it('apto: o parecer fica gravado e o material publicado NÃO é alterado', async () => {
    const a = await autor('atualiza');
    const secao = um(`select id from public.material_sections where material_id = '${materialId}' order by sort_order limit 1;`);
    const conteudoAntes = um(`select content from public.material_sections where id = '${secao}';`);
    const hashAntes = um(`select app.material_snapshot_hash('${materialId}'::uuid);`);
    const texto = materialParaEnvio({ titulo: tituloDoMaterial, disciplina, tema, corpo: 'Texto ATUALIZADO pela revisão com citação [1](#ref-1) e outra [2](#ref-2).' });
    const envio = um(
      `insert into public.material_submissions (author_id, title, content_md, target_material_id) values ('${a.id}', '${q(tituloDoMaterial)}', '${q(texto)}', '${materialId}') returning id;`,
    );
    expect(statusDoEnvio('material_submissions', envio)).toBe('aguardando_revisao');

    const { resumo } = await rodar();

    expect(resumo).toMatchObject({ falha: null, chamadasAoClaude: 1 });
    expect(revisaoDe('submission_id', envio)).toMatchObject({ status: 'concluida', verdict: 'apto' });
    expect(um(`select status || '|' || (applied_at is null)::text from public.material_submissions where id = '${envio}';`)).toBe('apto|true');
    expect(um(`select content from public.material_sections where id = '${secao}';`)).toBe(conteudoAntes);
    expect(um(`select app.material_snapshot_hash('${materialId}'::uuid);`)).toBe(hashAntes);
    expect(um(`select status from public.materials where id = '${materialId}';`)).toBe('published');
  });
});

describe('limites de custo (o admin não é barrado) e trava', () => {
  let tetos = { mensal: 0, diario: 0 };
  beforeAll(() => {
    const t = um(`select monthly_review_cap || '|' || daily_review_cap_per_user from public.review_settings;`).split('|');
    tetos = { mensal: Number(t[0]), diario: Number(t[1]) };
  });
  const restaurarTetos = () => psqlLocal(`update public.review_settings set monthly_review_cap = ${tetos.mensal}, daily_review_cap_per_user = ${tetos.diario};`);
  const novoEnvio = (autorId: string, rotulo: string) => {
    const t = `${MATERIAL_PREFIX}rl-${rotulo}-${tag}`;
    return envioDeMaterial(autorId, t, materialParaEnvio({ titulo: t, disciplina, tema }));
  };

  it('teto por pessoa por dia: o admin com teto 1 tem os dois envios revisados; outra pessoa (envio antigo) só o primeiro', async () => {
    const dono = await autor('diario-admin');
    const antigo = await autor('diario-antigo', 'student');
    let a2 = '';
    psqlLocal(`update public.review_settings set monthly_review_cap = 100000, daily_review_cap_per_user = 1;`);
    try {
      const d1 = novoEnvio(dono.id, 'da1');
      const d2 = novoEnvio(dono.id, 'da2');
      const a1 = novoEnvio(antigo.id, 'dn1');
      a2 = novoEnvio(antigo.id, 'dn2');
      const antes = chamadasAoClaude().length;

      const { resumo } = await rodar();

      expect(resumo.falha).toBeNull();
      expect(chamadasAoClaude()).toHaveLength(antes + 3);
      expect([d1, d2].map((e) => statusDoEnvio('material_submissions', e))).toEqual(['apto', 'apto']);
      expect(statusDoEnvio('material_submissions', a1)).toBe('apto');
      expect(statusDoEnvio('material_submissions', a2)).toBe('aguardando_revisao');
      expect(um(`select count(*) from public.material_reviews where submission_id = '${a2}';`)).toBe('0');
    } finally {
      restaurarTetos();
    }
    // Com o teto de volta, o envio que esperava é revisado (a fila não fica presa) e não sobra nada para o próximo teste.
    expect((await rodar()).resumo.falha).toBeNull();
    expect(statusDoEnvio('material_submissions', a2)).toBe('apto');
  });

  it('teto do mês: no teto, o envio do admin ainda é revisado e o de outra pessoa espera até abrir vaga', async () => {
    const dono = await autor('mensal-admin');
    const antigo = await autor('mensal-antigo', 'student');
    const usadas = Number(um(`select app.reviews_used_this_month();`));
    psqlLocal(`update public.review_settings set monthly_review_cap = ${usadas}, daily_review_cap_per_user = 50;`);
    try {
      const ed = novoEnvio(dono.id, 'ma');
      const ea = novoEnvio(antigo.id, 'mn');
      const antes = chamadasAoClaude().length;

      const { resumo } = await rodar();

      expect(resumo.falha).toBeNull();
      expect(chamadasAoClaude()).toHaveLength(antes + 1);
      expect(statusDoEnvio('material_submissions', ed)).toBe('apto');
      expect(statusDoEnvio('material_submissions', ea)).toBe('aguardando_revisao');

      // Abre vaga (o teto sobe): o envio de outra pessoa passa a ser revisado.
      psqlLocal(`update public.review_settings set monthly_review_cap = 100000;`);
      const depois = await rodar();
      expect(depois.resumo.falha).toBeNull();
      expect(chamadasAoClaude()).toHaveLength(antes + 2);
      expect(statusDoEnvio('material_submissions', ea)).toBe('apto');
    } finally {
      restaurarTetos();
    }
  });

  it('o admin pode ter mais de 3 envios esperando: todos são aceitos e revisados; quem não é admin continua limitado a 3', async () => {
    const dono = await autor('espera-admin');
    const antigo = await autor('espera-antigo', 'student');
    const ids = [1, 2, 3, 4, 5].map((n) => novoEnvio(dono.id, `e${n}`));
    [1, 2, 3].forEach((n) => novoEnvio(antigo.id, `x${n}`));
    expect(() => novoEnvio(antigo.id, 'x4')).toThrow();
    const antes = chamadasAoClaude().length;

    const { resumo } = await rodar();

    expect(resumo.falha).toBeNull();
    expect(ids.map((e) => statusDoEnvio('material_submissions', e))).toEqual(Array(5).fill('apto'));
    expect(chamadasAoClaude()).toHaveLength(antes + 5 + 3);
  });

  it('trava do banco: com outro revisor rodando, a rodada sai sem fazer nada e sem chamar o claude', async () => {
    const a = await autor('trava');
    const t = `${MATERIAL_PREFIX}rl-t-${tag}`;
    const e = envioDeMaterial(a.id, t, materialParaEnvio({ titulo: t, disciplina, tema }));
    const cliente = clienteDoBanco(exec);
    const trava = await cliente.rpc('revisao_tentar_travar', { p_seconds: 120 });
    expect(trava.data).toMatch(/^[0-9a-f-]{36}$/);
    const antes = chamadasAoClaude().length;
    try {
      const { resumo } = await rodar();
      expect(resumo.puladaPelaTravaDoBanco).toBe(true);
      expect(chamadasAoClaude()).toHaveLength(antes);
      expect(statusDoEnvio('material_submissions', e)).toBe('aguardando_revisao');
    } finally {
      await cliente.rpc('revisao_destravar', { p_token: trava.data });
    }
    const depois = await rodar();
    expect(depois.resumo.falha).toBeNull();
    expect(statusDoEnvio('material_submissions', e)).toBe('apto');
  });
});

describe('falha do claude e fila vazia', () => {
  it('cota esgotada: o envio volta à fila SEM contar no limite, a rodada termina com falha e o próximo envio não é tentado', async () => {
    const a = await autor('cota');
    const t = `${MATERIAL_PREFIX}rl-c-${tag}`;
    const e = envioDeMaterial(a.id, t, materialParaEnvio({ titulo: t, disciplina, tema, corpo: 'Texto MARCA-COTA com citação [1](#ref-1) e outra [2](#ref-2).' }));
    const usadasAntes = Number(um(`select app.reviews_used_this_month();`));

    const { resumo, linhas } = await rodar();

    expect(resumo.falha).toMatch(/cota/);
    expect(statusDoEnvio('material_submissions', e)).toBe('aguardando_revisao');
    expect(um(`select count(*) from public.material_reviews where submission_id = '${e}';`)).toBe('0');
    expect(Number(um(`select app.reviews_used_this_month();`))).toBe(usadasAntes);
    expect(linhas.join('\n')).toMatch(/falha: claude: cota/);

    // Passado o problema, o mesmo envio é revisado normalmente.
    writeFileSync(registroDoClaude, '');
    psqlLocal(`update public.material_submissions set content_md = replace(content_md, 'MARCA-COTA', 'sem marca') where id = '${e}';`);
    const depois = await rodar();
    expect(depois.resumo.falha).toBeNull();
    expect(statusDoEnvio('material_submissions', e)).toBe('apto');
  });

  it('fila vazia no banco de verdade: termina sem chamar o claude', async () => {
    expect(Number((await exec(SQL_DA_FILA))[0]?.n)).toBe(0);
    const antes = chamadasAoClaude().length;
    const { resumo, linhas } = await rodar();
    expect(resumo).toMatchObject({ fila: 'vazia', ciclos: 0, chamadasAoClaude: 0, falha: null });
    expect(chamadasAoClaude()).toHaveLength(antes);
    expect(linhas.join('\n')).toContain('fila vazia');
  });
});
