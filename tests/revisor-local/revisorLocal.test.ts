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
  psqlLocal,
  runCleanup,
  type CreatedTestUser,
} from '../e2e/fixtures/localSupabase';
import { materialParaEnvio } from '../e2e/fixtures/materialParaEnvio';
import { loteParaEnvio } from '../e2e/fixtures/questoesParaEnvio';

// D-12 — o revisor local de ponta a ponta contra o Supabase LOCAL (nunca o remoto), com o `claude` SIMULADO
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

async function autor(prefixo: string): Promise<CreatedTestUser> {
  const u = await createTestUser({ emailLocalPart: `rl-${prefixo}-${tag}`, password: 'senha-teste-123', role: 'student', status: 'active' });
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
    perguntar: perguntarAoClaude({ exe: process.execPath, argsIniciais: [FALSO], pastaNeutra: path.join(pasta, 'neutra'), timeoutMs: 60_000 }),
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
  it('apto: o claude simulado é chamado uma vez, o veredito chega igual ao que a Edge Function gravaria, e o material é publicado', async () => {
    const a = await autor('apto');
    tituloDoMaterial = `${MATERIAL_PREFIX}rl-${tag}`;
    const envio = envioDeMaterial(a.id, tituloDoMaterial, materialParaEnvio({ titulo: tituloDoMaterial, disciplina, tema }));
    expect(statusDoEnvio('material_submissions', envio)).toBe('aguardando_revisao');

    const { resumo, linhas } = await rodar();

    expect(resumo).toMatchObject({ fila: 'com trabalho', ciclos: 2, chamadasAoClaude: 1, falha: null });
    expect(resumo.totais).toMatchObject({ enviados: 1, resultados: 1, publicados: 1, reprovadosAntesDaIa: 0 });
    const chamadas = chamadasAoClaude();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].entradaTemFronteira).toBe(true);

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

    // Estado final: publicado pelo banco, com o selo "revisado por IA".
    expect(statusDoEnvio('material_submissions', envio)).toBe('publicado');
    materialId = um(`select published_material_id from public.material_submissions where id = '${envio}';`);
    expect(materialId).toMatch(/^[0-9a-f-]{36}$/);
    expect(um(`select status from public.materials where id = '${materialId}';`)).toBe('published');
    expect(um(`select count(*) from public.material_ai_provenance where material_id = '${materialId}';`)).toBe('1');
    expect(um(`select app.material_tem_revisao_apto('${materialId}'::uuid)::text;`)).toBe('true');

    // O registro da rodada não leva o texto nem o título do envio.
    const registro = linhas.join('\n');
    expect(registro).not.toContain(tituloDoMaterial);
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
  it('lote apto: as questões são criadas, ligadas ao material pelo título e publicadas', async () => {
    expect(materialId, 'o material do primeiro teste precisa existir').not.toBe('');
    const a = await autor('questoes');
    const nome = `Lote RL ${tag}`;
    const texto = loteParaEnvio(2, { disciplina, tema, materiais: tituloDoMaterial });
    const envio = envioDeQuestoes(a.id, nome, texto);

    const { resumo } = await rodar();

    expect(resumo).toMatchObject({ falha: null, chamadasAoClaude: 1 });
    expect(resumo.totais.publicados).toBe(1);
    const esperado = lerVeredito({ stopReason: 'end_turn', texto: TEXTO_APTO });
    expect(revisaoDe('question_submission_id', envio)).toMatchObject({
      status: 'concluida',
      verdict: 'apto',
      verdict_line: esperado.linhaDoVeredito,
      findings_text: esperado.achados,
      prompt_sha256: await sha256Hex(montarSistemaDeQuestoes(BASE_DO_REVISOR_DE_QUESTOES)),
    });
    expect(statusDoEnvio('question_submissions', envio)).toBe('publicado');
    const ids = `(select unnest(published_question_ids) from public.question_submissions where id = '${envio}')`;
    expect(um(`select count(*) from public.questions where id in ${ids} and status = 'published';`)).toBe('2');
    expect(um(`select count(*) from public.question_materials where material_id = '${materialId}' and question_id in ${ids};`)).toBe('2');
  });
});

describe('atualização de material', () => {
  it('apto: o conteúdo do material publicado é substituído (mesmo material, mesmas seções) e o selo passa a valer para o conteúdo novo', async () => {
    expect(materialId).not.toBe('');
    const a = await autor('atualiza');
    const secaoAntes = um(`select id from public.material_sections where material_id = '${materialId}' order by sort_order limit 1;`);
    const hashAntes = um(`select app.material_snapshot_hash('${materialId}'::uuid);`);
    const texto = materialParaEnvio({ titulo: tituloDoMaterial, disciplina, tema, corpo: 'Texto ATUALIZADO pela revisão com citação [1](#ref-1) e outra [2](#ref-2).' });
    const envio = um(
      `insert into public.material_submissions (author_id, title, content_md, target_material_id) values ('${a.id}', '${q(tituloDoMaterial)}', '${q(texto)}', '${materialId}') returning id;`,
    );
    expect(statusDoEnvio('material_submissions', envio)).toBe('aguardando_revisao');

    const { resumo } = await rodar();

    expect(resumo).toMatchObject({ falha: null, chamadasAoClaude: 1 });
    expect(resumo.totais.atualizados).toBe(1);
    expect(revisaoDe('submission_id', envio)).toMatchObject({ status: 'concluida', verdict: 'apto' });
    expect(um(`select status || '|' || (applied_at is not null)::text from public.material_submissions where id = '${envio}';`)).toBe('publicado|true');
    expect(um(`select content from public.material_sections where id = '${secaoAntes}';`)).toContain('Texto ATUALIZADO pela revisão');
    expect(um(`select app.material_snapshot_hash('${materialId}'::uuid);`)).not.toBe(hashAntes);
    expect(um(`select app.material_tem_revisao_apto('${materialId}'::uuid)::text;`)).toBe('true');
    expect(um(`select status from public.materials where id = '${materialId}';`)).toBe('published');
  });
});

describe('limites de custo e trava', () => {
  let tetos = { mensal: 0, diario: 0 };
  beforeAll(() => {
    const t = um(`select monthly_review_cap || '|' || daily_review_cap_per_user from public.review_settings;`).split('|');
    tetos = { mensal: Number(t[0]), diario: Number(t[1]) };
  });
  const restaurarTetos = () => psqlLocal(`update public.review_settings set monthly_review_cap = ${tetos.mensal}, daily_review_cap_per_user = ${tetos.diario};`);

  it('teto por pessoa por dia: com teto 1, só o primeiro envio da pessoa é revisado; o outro espera', async () => {
    const a = await autor('diario');
    psqlLocal(`update public.review_settings set monthly_review_cap = 100000, daily_review_cap_per_user = 1;`);
    try {
      const t1 = `${MATERIAL_PREFIX}rl-d1-${tag}`;
      const t2 = `${MATERIAL_PREFIX}rl-d2-${tag}`;
      const e1 = envioDeMaterial(a.id, t1, materialParaEnvio({ titulo: t1, disciplina, tema }));
      const e2 = envioDeMaterial(a.id, t2, materialParaEnvio({ titulo: t2, disciplina, tema }));
      const antes = chamadasAoClaude().length;

      const { resumo } = await rodar();

      expect(resumo.falha).toBeNull();
      expect(chamadasAoClaude()).toHaveLength(antes + 1);
      expect(statusDoEnvio('material_submissions', e1)).toBe('publicado');
      expect(statusDoEnvio('material_submissions', e2)).toBe('aguardando_revisao');
      expect(um(`select count(*) from public.material_reviews where submission_id = '${e2}';`)).toBe('0');
    } finally {
      restaurarTetos();
    }
  });

  it('teto do mês: no teto, nenhum envio novo é revisado e o claude nem é chamado', async () => {
    const a = await autor('mensal');
    const usadas = Number(um(`select app.reviews_used_this_month();`));
    // Folga para um envio só (o do dia anterior, que esperava, não conta: é de outra pessoa e já foi para a vez dele depois).
    psqlLocal(`update public.review_settings set monthly_review_cap = ${usadas}, daily_review_cap_per_user = 50;`);
    try {
      const t = `${MATERIAL_PREFIX}rl-m-${tag}`;
      const e = envioDeMaterial(a.id, t, materialParaEnvio({ titulo: t, disciplina, tema }));
      const antes = chamadasAoClaude().length;

      const { resumo } = await rodar();

      expect(resumo.falha).toBeNull();
      expect(chamadasAoClaude()).toHaveLength(antes);
      expect(statusDoEnvio('material_submissions', e)).toBe('aguardando_revisao');

      // Abre uma vaga: o mesmo envio passa a ser revisado.
      psqlLocal(`update public.review_settings set monthly_review_cap = ${usadas + 1};`);
      const depois = await rodar();
      expect(depois.resumo.falha).toBeNull();
      expect(chamadasAoClaude()).toHaveLength(antes + 1);
      expect(statusDoEnvio('material_submissions', e)).toBe('publicado');
    } finally {
      restaurarTetos();
    }
  });

  it('o envio que esperava pelo teto do dia é revisado quando o teto sobe (a fila não fica presa)', async () => {
    const { resumo } = await rodar();
    expect(resumo.falha).toBeNull();
    expect(um(`select count(*) from public.material_submissions where status in ('aguardando_revisao', 'em_revisao', 'apto');`)).toBe('0');
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
    expect(statusDoEnvio('material_submissions', e)).toBe('publicado');
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
    expect(statusDoEnvio('material_submissions', e)).toBe('publicado');
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
