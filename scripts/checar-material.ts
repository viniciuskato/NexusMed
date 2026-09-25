/**
 * Checagem do padrão de conteúdos sobre arquivos `.md` de material (44-C1),
 * antes de importar. Não precisa de login nem de Supabase; só lê os arquivos.
 *
 * Uso:
 *   npm run checar:material -- caminho/do/material.md   # lista as pendências
 *   npm run checar:material -- caminho/da/pasta         # uma linha por arquivo
 *
 * Numa pasta, olha os `.md` diretamente dentro dela (sem subpastas); para ver
 * o detalhe de um arquivo, rode sobre ele.
 *
 * Saída 0 quando nenhum arquivo seria recusado pela importação (pendência
 * orienta, não bloqueia); 1 quando algum seria; 2 em erro de uso.
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

const alvo = process.argv[2];
if (!alvo) {
  console.error('Uso: npm run checar:material -- <arquivo.md | pasta>');
  process.exit(2);
}

let info;
try {
  info = statSync(alvo);
} catch {
  console.error(`Não encontrado: ${alvo}`);
  process.exit(2);
}

const checar = (arquivo: string) => checarMaterialMarkdown(readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, ''));

if (info.isDirectory()) {
  const arquivos = readdirSync(alvo)
    .filter((n) => n.toLowerCase().endsWith('.md'))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (arquivos.length === 0) {
    console.error(`Nenhum arquivo .md em ${alvo}`);
    process.exit(2);
  }
  let recusados = 0;
  for (const nome of arquivos) {
    const r = checar(path.join(alvo, nome));
    if (situacaoDaChecagem(r) === 'erro') recusados++;
    console.log(formatarResumoDaChecagem(nome, r));
  }
  process.exit(recusados > 0 ? 1 : 0);
} else {
  const r = checar(alvo);
  console.log(formatarChecagemDetalhada(path.basename(alvo), r));
  process.exit(situacaoDaChecagem(r) === 'erro' ? 1 : 0);
}
