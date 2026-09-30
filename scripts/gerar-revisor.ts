// Gera os dois arquivos que a Edge Function `revisar-envios` (44-F) precisa e que
// vivem FORA da pasta dela — a função só publica o que está em
// supabase/functions/revisar-envios/:
//
//   gerado/textos.ts     o prompt revisor + a Parte 1 do padrão, montados como a
//                        página "Como escrever um material" os copia (mesmos
//                        arquivos de docs/editorial/, mesma montagem);
//   gerado/validacao.js  a checagem do padrão e a importação que a tela de envio
//                        roda (src/utils/envioDeMaterial.ts e o que ele usa),
//                        empacotadas, para o servidor conferir o arquivo antes de
//                        gastar com a IA. É a mesma regra, não uma cópia à mão.
//
// Uso:  npm run gerar:revisor          escreve os arquivos
//       npm run gerar:revisor -- --check   falha se estiverem desatualizados
// Os arquivos gerados ficam no repositório (o typecheck e o deploy precisam
// deles) e um teste confere que estão em dia; quem muda o padrão, os prompts ou
// a checagem roda este comando antes de publicar a função.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { extrairParte1, montarTextoParaCopiar, normalizarTexto } from '../src/utils/padraoMaterial';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, 'supabase/functions/revisar-envios/gerado');

const CABECALHO_TS =
  '// GERADO por scripts/gerar-revisor.ts a partir de docs/editorial/. NÃO EDITE: rode `npm run gerar:revisor`.\n';
const CABECALHO_JS =
  '/* eslint-disable */\n// GERADO por scripts/gerar-revisor.ts (empacota src/utils/envioDeMaterial.ts). NÃO EDITE: rode `npm run gerar:revisor`.\n';

function lerTexto(relativo: string): string {
  return readFileSync(path.join(RAIZ, relativo), 'utf8');
}

export function gerarTextos(): string {
  const parte1 = extrairParte1(lerTexto('docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md'));
  const prompt = normalizarTexto(lerTexto('docs/editorial/PROMPT-REVISAR-MATERIAL.txt'));
  const base = montarTextoParaCopiar(prompt, parte1);
  return `${CABECALHO_TS}export const BASE_DO_REVISOR = ${JSON.stringify(base)};\n`;
}

export async function gerarValidacao(): Promise<string> {
  const resultado = await build({
    stdin: {
      contents: "export { lerArquivoParaEnvio, avaliarEnvio, motivosDaReprovacao, lerMaterialParaPublicar } from './src/utils/envioDeMaterial.ts';",
      resolveDir: RAIZ,
      sourcefile: 'entrada-da-validacao.ts',
      loader: 'ts',
    },
    bundle: true,
    // O `.md` nunca passa pelo leitor de YAML (só o formato antigo `.compendium.yaml`
    // o usa): a biblioteca fica de fora do pacote e vira um esqueleto que falha
    // se alguém a chamar.
    plugins: [
      {
        name: 'sem-yaml',
        setup(b) {
          b.onResolve({ filter: /^yaml$/ }, () => ({ path: 'yaml', namespace: 'sem-yaml' }));
          b.onLoad({ filter: /.*/, namespace: 'sem-yaml' }, () => ({
            contents: "export function parse() { throw new Error('YAML não é lido na revisão de envios'); }",
            loader: 'js',
          }));
        },
      },
    ],
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    legalComments: 'none',
    charset: 'utf8',
    logLevel: 'silent',
  });
  const texto = resultado.outputFiles[0].text.replace(/\r\n/g, '\n');
  return `${CABECALHO_JS}${texto}`;
}

export async function gerarTudo(): Promise<Record<string, string>> {
  return { 'textos.ts': gerarTextos(), 'validacao.js': await gerarValidacao() };
}

async function principal() {
  const arquivos = await gerarTudo();
  const soConferir = process.argv.includes('--check');
  let desatualizado = false;
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const destino = path.join(SAIDA, nome);
    const atual = existsSync(destino) ? readFileSync(destino, 'utf8').replace(/\r\n/g, '\n') : null;
    if (atual === conteudo) continue;
    if (soConferir) {
      desatualizado = true;
      console.error(`gerar:revisor: ${nome} está desatualizado — rode \`npm run gerar:revisor\`.`);
    } else {
      mkdirSync(SAIDA, { recursive: true });
      writeFileSync(destino, conteudo, 'utf8');
      console.log(`gerar:revisor: ${nome} escrito.`);
    }
  }
  if (soConferir && desatualizado) process.exit(1);
  if (soConferir) console.log('gerar:revisor: arquivos em dia.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
