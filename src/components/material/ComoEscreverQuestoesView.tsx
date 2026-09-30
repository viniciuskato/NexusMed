import React, { useMemo } from 'react';
import { FileQuestion } from 'lucide-react';
import { Compendium, Discipline, Theme } from '../../types';
import { SafeMarkdown } from '../common/SafeMarkdown';
import {
  PADRAO_DE_QUESTOES,
  PROMPT_CRIAR_QUESTOES,
  PROMPT_REVISAR_QUESTOES,
  TEXTO_COPIAR_CRIAR_QUESTOES,
  TEXTO_COPIAR_REVISAR_QUESTOES,
} from '../../content/padraoQuestoes';
import { dividirEmBlocos, paraExibicao } from '../../utils/padraoMaterial';
import { CartaoPrompt, CatalogoDeTemas } from './ComoEscreverMaterialView';

// ============================================================================
// "Como escrever questões" (44-H1)
//
// Irmã de "Como escrever um material": mostra o padrão de questões para quem
// escreve, o catálogo de Disciplinas e Temas, os títulos exatos dos materiais
// publicados (as questões se ligam a eles pelo título) e dois textos para copiar
// com um clique — o prompt de criação e o prompt revisor, cada um já com o
// padrão junto. Os textos vêm dos arquivos de docs/editorial/
// (ver src/content/padraoQuestoes.ts).
// ============================================================================

interface ComoEscreverQuestoesViewProps {
  disciplines: Discipline[];
  themes: Theme[];
  /** Só os publicados entram na lista de títulos. */
  compendiums: Compendium[];
  /** Abre a tela "Enviar material", no modo de questões. */
  onAbrirEnvio?: () => void;
}

export const ComoEscreverQuestoesView: React.FC<ComoEscreverQuestoesViewProps> = ({
  disciplines,
  themes,
  compendiums,
  onAbrirEnvio,
}) => {
  const blocosDoPadrao = useMemo(() => dividirEmBlocos(PADRAO_DE_QUESTOES), []);

  const titulosPorDisciplina = useMemo(() => {
    const collator = new Intl.Collator('pt-BR');
    const publicados = compendiums.filter((c) => c.publicationStatus === 'published');
    return [...disciplines]
      .sort((a, b) => collator.compare(a.name, b.name))
      .map((disciplina) => ({
        disciplina,
        titulos: publicados
          .filter((c) => c.disciplineId === disciplina.id)
          .map((c) => c.title)
          .sort((a, b) => collator.compare(a, b)),
      }))
      .filter((g) => g.titulos.length > 0);
  }, [disciplines, compendiums]);

  return (
    <div id="como-escrever-questoes-view" className="space-y-8 max-w-4xl mx-auto">
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
            <FileQuestion className="w-5 h-5" aria-hidden="true" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-serif-reading text-slate-900 dark:text-white">
            Como escrever questões
          </h1>
        </div>
        <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
          Quer escrever questões comentadas para o NexusMed, com ou sem ajuda de uma IA? Esta página mostra como
          elas devem ser, quais Disciplinas, Temas e materiais existem e traz dois textos prontos para copiar.
        </p>
        <p
          id="como-escrever-questoes-fluxo"
          className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed p-4 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
        >
          <strong>O caminho:</strong> crie as questões com o primeiro prompt; se quiser, confira com o prompt
          revisor, na sua própria IA (opcional); depois envie o arquivo pelo site
          {onAbrirEnvio && (
            <>
              {' ('}
              <button
                type="button"
                id="como-escrever-questoes-enviar"
                onClick={onAbrirEnvio}
                className="text-teal-700 dark:text-teal-400 font-semibold underline cursor-pointer"
              >
                Enviar material, na aba Questões
              </button>
              {')'}
            </>
          )}
          . O envio só é aceito se o arquivo passa pela importação sem pendência. Uma revisão automática (feita por
          IA) confere gabarito, fontes e formato; com o “apto”, as questões são publicadas ligadas aos materiais,
          com a marca “Revisado por IA — ainda não lido por uma pessoa”. Se a revisão apontar problemas, você vê os
          achados na lista de envios, corrige e envia de novo.
        </p>
      </header>

      <section aria-labelledby="como-escrever-questoes-prompts" className="space-y-4">
        <h2 id="como-escrever-questoes-prompts" className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Dois textos para copiar
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <CartaoPrompt
            nomeDoPadrao="padrão de questões"
            id="como-escrever-questoes-cartao-criar"
            titulo="1. Criar questões"
            descricao="Cole numa IA de sua escolha. Ela pergunta o que faltar (Disciplina, Tema, tipo, quantas questões e os materiais que elas cobrem) e entrega o arquivo .md no padrão, mais a lista de pontos de risco."
            rotuloBotao="Copiar prompt para criar questões"
            prompt={PROMPT_CRIAR_QUESTOES}
            textoCompleto={TEXTO_COPIAR_CRIAR_QUESTOES}
          />
          <CartaoPrompt
            nomeDoPadrao="padrão de questões"
            id="como-escrever-questoes-cartao-revisar"
            titulo="2. Revisar questões"
            descricao="Opcional, mas recomendado. Cole numa IA, depois cole o lote pronto. Ela confere gabarito, fontes, banca e formato e termina com o veredito (“APTO PARA ENVIAR” ou “NÃO APTO”) e um bloco de correção, pronto para devolver a quem escreveu."
            rotuloBotao="Copiar prompt revisor de questões"
            prompt={PROMPT_REVISAR_QUESTOES}
            textoCompleto={TEXTO_COPIAR_REVISAR_QUESTOES}
          />
        </div>
      </section>

      <CatalogoDeTemas disciplines={disciplines} themes={themes} objeto="questoes" />

      <section aria-labelledby="como-escrever-questoes-materiais" className="space-y-3">
        <h2 id="como-escrever-questoes-materiais" className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Materiais publicados
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          No campo “Materiais cobertos” use o título exatamente como aparece aqui. Só materiais publicados valem.
        </p>
        {titulosPorDisciplina.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum material publicado ainda.</p>
        ) : (
          <div id="como-escrever-questoes-materiais-lista" className="space-y-2">
            {titulosPorDisciplina.map(({ disciplina, titulos }) => (
              <details
                key={disciplina.id}
                className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                <summary className="text-sm font-bold text-slate-900 dark:text-slate-100 cursor-pointer select-none min-h-8 flex items-center">
                  {disciplina.name} ({titulos.length})
                </summary>
                <ul className="mt-2 space-y-1 text-sm text-slate-800 dark:text-slate-200">
                  {titulos.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="como-escrever-questoes-padrao" className="space-y-4">
        <h2 id="como-escrever-questoes-padrao" className="text-xl font-bold text-slate-900 dark:text-slate-100">
          O padrão de questões
        </h2>
        <div
          id="como-escrever-questoes-padrao-texto"
          className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
        >
          {blocosDoPadrao.map((bloco, i) =>
            bloco.tipo === 'codigo' ? (
              <pre
                key={i}
                className="my-4 overflow-x-auto p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed text-slate-800 dark:text-slate-200 font-mono"
              >
                {bloco.conteudo}
              </pre>
            ) : (
              <SafeMarkdown key={i} content={paraExibicao(bloco.conteudo)} />
            ),
          )}
        </div>
      </section>
    </div>
  );
};
