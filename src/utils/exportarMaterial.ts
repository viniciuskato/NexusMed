import type { Compendium, Discipline, Theme } from '../types';
import { ALERT_LABEL, PEARL_LABEL, TAKEAWAYS_LABEL } from './compendiumMarkdownImport';
import { VERSAO_ATUAL_DO_PADRAO } from './compendiumStandardCheck';

// ============================================================================
// Exportar um material como arquivo `.md` do padrão (44-B)
//
// O inverso da importação (`parseCompendiumMarkdownText`): o mesmo formato que a
// checagem do padrão e o importador leem — título, metadados, seções (Tag de Mecanismo,
// corpo, Pontos-Chave, Pérola, Alerta), palavras-chave e referências. Exportar e
// importar andam juntos: o teste de ida e volta (exportar → ler → o mesmo conteúdo) é o
// aceite automático, e qualquer mudança de formato mexe nos dois (AGENTS.md, risco 17).
//
// Exportar é livre (não passa por revisão): só escreve o que já está no material. Quando o
// conteúdo tem algo que o formato do arquivo não sabe representar (linha `### ` dentro do
// texto de uma seção, Pérola com quebra de linha...), o arquivo sai como o formato permite e
// a lista de `avisos` diz o quê — para a pessoa ver antes de editar e reenviar.
// ============================================================================

/** A versão do padrão de conteúdos que a linha de metadados declara. */
export const VERSAO_DO_PADRAO = VERSAO_ATUAL_DO_PADRAO;

export interface MaterialExportado {
  texto: string;
  nomeDoArquivo: string;
  /** O que o formato do arquivo não representa fielmente, em frases. */
  avisos: string[];
}

function umaLinha(s: string): string {
  return s.replace(/\s*\r?\n\s*/g, ' ').trim();
}

function nomeDeArquivoDe(titulo: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'material'}.md`;
}

/** As linhas do corpo de uma seção que o importador leria como outra coisa (e por isso não voltam iguais). */
function linhasAmbiguasDoCorpo(conteudo: string): string[] {
  const achadas: string[] = [];
  for (const linha of conteudo.split(/\r\n|\n/)) {
    const t = linha.trim();
    if (
      /^###\s+/.test(t) ||
      /^(---+|\*\*\*+)$/.test(t) ||
      /^\*\*Tag de Mecanismo:?\*\*/i.test(t) ||
      TAKEAWAYS_LABEL.test(t) ||
      /^>\s?/.test(t) && (PEARL_LABEL.test(t.replace(/^>\s?/, '').replace(/^[^\w*]*/u, '')) || ALERT_LABEL.test(t.replace(/^>\s?/, '').replace(/^[^\w*]*/u, '')))
    ) {
      achadas.push(t.length > 60 ? `${t.slice(0, 59)}…` : t);
    }
  }
  return achadas;
}

export function exportarMaterialParaMarkdown(
  material: Pick<
    Compendium,
    'title' | 'subtitle' | 'author' | 'estimatedReadTimeMinutes' | 'tags' | 'sections' | 'references' | 'disciplineId' | 'themeId'
  >,
  disciplines: Discipline[],
  themes: Theme[],
): MaterialExportado {
  const avisos: string[] = [];
  const disciplina = disciplines.find((d) => d.id === material.disciplineId)?.name ?? '';
  const tema = themes.find((t) => t.id === material.themeId)?.name ?? '';
  const linhas: string[] = [];

  linhas.push(`# ${umaLinha(material.title)}`, '');
  if (material.subtitle && material.subtitle.trim()) linhas.push(`**Subtítulo:** ${umaLinha(material.subtitle)}`);
  linhas.push(`**Disciplina:** ${disciplina}`);
  linhas.push(`**Tema:** ${tema}`);
  if (material.author && material.author.trim()) linhas.push(`**Autor:** ${umaLinha(material.author)}`);
  if (material.estimatedReadTimeMinutes > 0) linhas.push(`**Tempo estimado de leitura:** ${material.estimatedReadTimeMinutes} minutos`);
  linhas.push(`**Versão do padrão:** ${VERSAO_DO_PADRAO}`, '');

  for (const secao of material.sections) {
    linhas.push(`### ${umaLinha(secao.title)}`);
    if (secao.mechanismTag && secao.mechanismTag.trim()) linhas.push(`**Tag de Mecanismo:** ${umaLinha(secao.mechanismTag)}`);
    linhas.push('');
    const corpo = secao.content.trim();
    if (corpo) linhas.push(corpo, '');
    const ambiguas = linhasAmbiguasDoCorpo(secao.content);
    if (ambiguas.length > 0) {
      avisos.push(
        `Na seção “${umaLinha(secao.title)}” há linhas que o arquivo lê como outra coisa (“${ambiguas[0]}”): reveja o texto antes de reenviar.`,
      );
    }
    if (/\n{3,}/.test(secao.content.trim())) {
      avisos.push(`Na seção “${umaLinha(secao.title)}” há linhas em branco em sequência: o arquivo junta todas em uma.`);
    }
    if (secao.keyTakeaways.length > 0) {
      linhas.push('**Pontos-Chave:**');
      for (const p of secao.keyTakeaways) {
        if (/\r?\n/.test(p)) avisos.push(`Um Ponto-Chave da seção “${umaLinha(secao.title)}” tem quebra de linha: o arquivo a troca por espaço.`);
        linhas.push(`- ${umaLinha(p)}`);
      }
      linhas.push('');
    }
    if (secao.clinicalPearl && secao.clinicalPearl.trim()) {
      if (/\r?\n/.test(secao.clinicalPearl)) avisos.push(`A Pérola da seção “${umaLinha(secao.title)}” tem quebra de linha: o arquivo a troca por espaço.`);
      linhas.push(`> 💡 **Pérola Clínica:** ${umaLinha(secao.clinicalPearl)}`);
    }
    if (secao.warningAlert && secao.warningAlert.trim()) {
      if (/\r?\n/.test(secao.warningAlert)) avisos.push(`O Alerta da seção “${umaLinha(secao.title)}” tem quebra de linha: o arquivo a troca por espaço.`);
      linhas.push(`> ⚠️ **Alerta de Armadilha:** ${umaLinha(secao.warningAlert)}`);
    }
    if ((secao.clinicalPearl && secao.clinicalPearl.trim()) || (secao.warningAlert && secao.warningAlert.trim())) linhas.push('');
  }

  const tags = (material.tags ?? []).filter((t) => t.trim());
  if (tags.length > 0) {
    if (tags.some((t) => t.includes('`'))) avisos.push('Uma palavra-chave tem crase, que o arquivo usa como delimitador.');
    linhas.push('### Palavras-chave', tags.map((t) => `\`${t}\``).join(' '), '');
  }

  if (material.references.length > 0) {
    linhas.push('### Referências Bibliográficas');
    material.references.forEach((r, i) => {
      if (/\r?\n/.test(r)) avisos.push(`A referência ${i + 1} tem quebra de linha: o arquivo a troca por espaço.`);
      linhas.push(`${i + 1}. ${umaLinha(r)}`);
    });
    linhas.push('');
  }

  return { texto: `${linhas.join('\n').replace(/\n+$/, '')}\n`, nomeDoArquivo: nomeDeArquivoDe(material.title), avisos };
}

/** Baixa o texto como arquivo pelo navegador (só no navegador). */
export function baixarArquivoDeTexto(nome: string, texto: string, tipo = 'text/markdown;charset=utf-8'): void {
  const blob = new Blob([texto], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
