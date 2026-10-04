import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ClipboardCopy, FilePenLine, TriangleAlert } from 'lucide-react';
import { Discipline, Theme } from '../../types';
import { SafeMarkdown } from '../common/SafeMarkdown';
import {
  PARTE_1_DO_PADRAO,
  PROMPT_CRIAR_MATERIAL,
  PROMPT_REVISAR_MATERIAL,
  TEXTO_COPIAR_CRIAR,
  TEXTO_COPIAR_REVISAR,
} from '../../content/padraoMaterial';
import { dividirEmBlocos, paraExibicao } from '../../utils/padraoMaterial';
import { copiarTexto } from '../../utils/areaDeTransferencia';

// ============================================================================
// "Como escrever um material" (44-D)
//
// Porta de entrada de quem quer produzir um material, com ou sem IA: mostra o
// padrão (Parte 1), o catálogo de Disciplinas e Temas com os nomes exatos e
// dois textos para copiar com um clique — o prompt de criação e o prompt
// revisor, cada um já com a Parte 1 junto. O texto do padrão e os dos prompts
// vêm dos arquivos de docs/editorial/ (ver src/content/padraoMaterial.ts).
// ============================================================================

interface ComoEscreverMaterialViewProps {
  disciplines: Discipline[];
  themes: Theme[];
  /** Abre a tela "Enviar material" (44-E). */
  onAbrirEnvio?: () => void;
}

type EstadoCopia = 'parado' | 'copiado' | 'falhou';

interface CartaoPromptProps {
  /** Como o padrão colado junto é chamado no texto do cartão (44-H1: o de questões usa o dele). */
  nomeDoPadrao?: string;
  id: string;
  titulo: string;
  descricao: string;
  rotuloBotao: string;
  prompt: string;
  textoCompleto: string;
}

export const CartaoPrompt: React.FC<CartaoPromptProps> = ({
  nomeDoPadrao = 'padrão de conteúdos',
  id,
  titulo,
  descricao,
  rotuloBotao,
  prompt,
  textoCompleto,
}) => {
  const [estado, setEstado] = useState<EstadoCopia>('parado');
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const areaManual = useRef<HTMLTextAreaElement>(null);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  // Se a cópia automática falhar, o texto inteiro aparece já selecionado.
  useEffect(() => {
    if (estado === 'falhou') areaManual.current?.select();
  }, [estado]);

  const copiar = async () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    const ok = await copiarTexto(textoCompleto);
    setEstado(ok ? 'copiado' : 'falhou');
    if (ok) {
      temporizador.current = setTimeout(() => setEstado('parado'), 4000);
    }
  };

  return (
    <section
      id={id}
      className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 elev-xs flex flex-col gap-3"
    >
      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{titulo}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{descricao}</p>

      <div>
        <button
          type="button"
          onClick={copiar}
          className="min-h-11 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors elev-xs"
        >
          {estado === 'copiado' ? (
            <Check className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ClipboardCopy className="w-4 h-4" aria-hidden="true" />
          )}
          <span>{rotuloBotao}</span>
        </button>
      </div>

      <p role="status" aria-live="polite" className="text-xs min-h-4 text-teal-700 dark:text-teal-300 font-medium">
        {estado === 'copiado' ? 'Copiado. Agora é só colar na conversa com a IA.' : ''}
      </p>

      {estado === 'falhou' && (
        <div className="space-y-2">
          <p
            role="alert"
            className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5 leading-relaxed"
          >
            <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Não foi possível copiar automaticamente. O texto está abaixo, já selecionado: use Ctrl+C
              (ou Cmd+C) para copiar.
            </span>
          </p>
          <textarea
            ref={areaManual}
            readOnly
            value={textoCompleto}
            aria-label={`Texto completo: ${titulo}`}
            className="w-full h-40 p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-800 dark:text-slate-200"
          />
        </div>
      )}

      <details className="group">
        <summary className="text-xs font-semibold text-teal-700 dark:text-teal-400 cursor-pointer select-none min-h-8 flex items-center">
          Ver o texto do prompt
        </summary>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          O botão copia este texto seguido do {nomeDoPadrao}, mostrado mais abaixo nesta página.
        </p>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed text-slate-800 dark:text-slate-200 font-mono">
          {prompt}
        </pre>
      </details>
    </section>
  );
};

/** Disciplinas e Temas do catálogo, com os nomes exatos (compartilhado com "Como escrever questões", 44-H1). */
export const CatalogoDeTemas: React.FC<{ disciplines: Discipline[]; themes: Theme[]; objeto?: 'material' | 'questoes' }> = ({
  disciplines,
  themes,
  objeto = 'material',
}) => {
  const catalogo = useMemo(() => {
    const collator = new Intl.Collator('pt-BR');
    return [...disciplines]
      .sort((a, b) => collator.compare(a.name, b.name))
      .map((disciplina) => ({
        disciplina,
        temas: themes
          .filter((tema) => tema.disciplineId === disciplina.id)
          .sort((a, b) => a.order - b.order || collator.compare(a.name, b.name)),
      }));
  }, [disciplines, themes]);

  return (
      <section aria-labelledby="como-escrever-catalogo" className="space-y-3">
        <h2 id="como-escrever-catalogo" className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Disciplinas e Temas do catálogo
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {objeto === 'questoes' ? 'Ao pedir as questões' : 'Ao pedir o material'}, use estes nomes exatamente como
          aparecem aqui. Não crie Disciplina nem Tema novos.
        </p>
        {catalogo.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">O catálogo ainda não foi carregado.</p>
        ) : (
          <ul id="como-escrever-catalogo-lista" className="grid gap-3 sm:grid-cols-2">
            {catalogo.map(({ disciplina, temas }) => (
              <li
                key={disciplina.id}
                className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{disciplina.name}</p>
                {temas.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Nenhum Tema cadastrado.</p>
                ) : (
                  <ul aria-label={`Temas de ${disciplina.name}`} className="mt-2 flex flex-wrap gap-1.5">
                    {temas.map((tema) => (
                      <li
                        key={tema.id}
                        className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200"
                      >
                        {tema.name}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
  );
};

export const ComoEscreverMaterialView: React.FC<ComoEscreverMaterialViewProps> = ({
  disciplines,
  themes,
  onAbrirEnvio,
}) => {
  const blocosDoPadrao = useMemo(() => dividirEmBlocos(PARTE_1_DO_PADRAO), []);

  return (
    <div id="como-escrever-material-view" className="space-y-8 max-w-4xl mx-auto">
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
            <FilePenLine className="w-5 h-5" aria-hidden="true" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-serif-reading text-slate-900 dark:text-white">
            Como escrever um material
          </h1>
        </div>
        <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
          Quer produzir um material para o NexusMed, com ou sem ajuda de uma IA? Esta página mostra como ele
          deve ser, quais Disciplinas e Temas existem e traz dois textos prontos para copiar.
        </p>
        <p
          id="como-escrever-fluxo"
          className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed p-4 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
        >
          <strong>O caminho:</strong> crie o material com o primeiro prompt; se quiser, confira com o prompt
          revisor, na sua própria IA (opcional); depois envie pelo site
          {onAbrirEnvio && (
            <>
              {' ('}
              <button
                type="button"
                id="como-escrever-enviar"
                onClick={onAbrirEnvio}
                className="text-teal-700 dark:text-teal-400 font-semibold underline cursor-pointer"
              >
                Enviar material
              </button>
              {')'}
            </>
          )}
          . O revisor de IA do próprio NexusMed confere o material e dá o parecer (“APTO PARA ENVIAR” ou os
          achados); quem decide e publica é o dono do site.
        </p>
      </header>

      <section aria-labelledby="como-escrever-prompts" className="space-y-4">
        <h2 id="como-escrever-prompts" className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Dois textos para copiar
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <CartaoPrompt
            id="como-escrever-cartao-criar"
            titulo="1. Criar o material"
            descricao="Cole numa IA de sua escolha. Ela pergunta o que faltar (título, Disciplina, Tema, nível, tempo de leitura, lugar na árvore e o que cobrir) e entrega o arquivo .md no padrão, mais a lista de pontos de risco."
            rotuloBotao="Copiar prompt para criar material"
            prompt={PROMPT_CRIAR_MATERIAL}
            textoCompleto={TEXTO_COPIAR_CRIAR}
          />
          <CartaoPrompt
            id="como-escrever-cartao-revisar"
            titulo="2. Revisar o material"
            descricao="Opcional, mas recomendado. Cole numa IA, depois cole o material pronto. Ela confere fontes e formato e termina com o veredito (“APTO PARA ENVIAR” ou “NÃO APTO”) e um bloco de correção, pronto para devolver a quem escreveu."
            rotuloBotao="Copiar prompt revisor"
            prompt={PROMPT_REVISAR_MATERIAL}
            textoCompleto={TEXTO_COPIAR_REVISAR}
          />
        </div>
      </section>

      <CatalogoDeTemas disciplines={disciplines} themes={themes} />

      <section aria-labelledby="como-escrever-padrao" className="space-y-4">
        <h2 id="como-escrever-padrao" className="text-xl font-bold text-slate-900 dark:text-slate-100">
          O padrão de conteúdos
        </h2>
        <p
          id="como-escrever-aviso-fontes"
          className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900"
        >
          No NexusMed só valem fontes disponíveis on-line: livro-texto não é aceito, mesmo que o padrão abaixo o
          cite.
        </p>
        <div
          id="como-escrever-padrao-texto"
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
