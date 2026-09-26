/**
 * Checagem do padrão de conteúdos sobre arquivos `.md` de material (44-C1),
 * antes de importar. Não precisa de login nem de Supabase; só lê os arquivos.
 *
 * Uso:
 *   npm run checar:material -- caminho/do/material.md   # lista as pendências
 *   npm run checar:material -- caminho/da/pasta         # uma linha por arquivo
 *   npm run checar:material -- a.md b.md pasta/         # uma linha por arquivo
 *
 * Com um único arquivo, mostra o detalhe; com pasta ou vários caminhos, uma
 * linha por arquivo — para ver o detalhe, rode sobre o arquivo. Numa pasta,
 * olha os `.md` diretamente dentro dela (sem subpastas).
 *
 * Saída 0 quando nenhum arquivo seria recusado pela importação (pendência
 * orienta, não bloqueia); 1 quando algum seria; 2 em erro de uso (caminho
 * inexistente, pasta sem `.md`, arquivo ilegível) — os demais são checados mesmo assim.
 * As regras vivem em `src/utils/compendiumStandardCheck.ts`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  checarMaterialMarkdown,
  formatarChecagemDetalhada,
  formatarResumoDaChecagem,
  situacaoDaChecagem,
} from '../src/utils/compendiumStandardCheck';

const alvos = process.argv.slice(2);
if (alvos.length === 0) {
  console.error('Uso: npm run checar:material -- <arquivo.md | pasta> [mais caminhos...]');
  process.exitCode = 2;
} else {
  let erroDeUso = false;
  const arquivos: string[] = [];
  for (const alvo of alvos) {
    let pasta: boolean;
    try {
      pasta = statSync(alvo).isDirectory();
    } catch {
      console.error(`Não encontrado: ${alvo}`);
      erroDeUso = true;
      continue;
    }
    if (!pasta) {
      arquivos.push(alvo);
      continue;
    }
    const mds = readdirSync(alvo)
      .filter((n) => n.toLowerCase().endsWith('.md'))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (mds.length === 0) {
      console.error(`Nenhum arquivo .md em ${alvo}`);
      erroDeUso = true;
    }
    arquivos.push(...mds.map((n) => path.join(alvo, n)));
  }

  const checar = (arquivo: string) => checarMaterialMarkdown(readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, ''));
  const detalhado = alvos.length === 1 && arquivos.length === 1 && arquivos[0] === alvos[0];
  let recusados = 0;
  for (const arquivo of arquivos) {
    let r;
    try {
      r = checar(arquivo);
    } catch (e) {
      // Ilegível (pasta com nome de .md, sem permissão): relata e segue.
      console.error(`Não foi possível ler ${arquivo}: ${e instanceof Error ? e.message : String(e)}`);
      erroDeUso = true;
      continue;
    }
    if (situacaoDaChecagem(r) === 'erro') recusados++;
    const nome = alvos.length === 1 ? path.basename(arquivo) : arquivo;
    console.log(detalhado ? formatarChecagemDetalhada(nome, r) : formatarResumoDaChecagem(nome, r));
  }
  if (arquivos.length > 1) console.log(`${arquivos.length} arquivos checados.`);
  // `exitCode` em vez de `process.exit`: deixa a saída terminar de ser escrita.
  process.exitCode = erroDeUso ? 2 : recusados > 0 ? 1 : 0;
}
