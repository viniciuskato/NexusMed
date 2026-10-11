import React, { useMemo, useRef, useState } from 'react';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { FileUp, X, CheckCircle2, AlertTriangle, Upload } from 'lucide-react';
import { Compendium, Discipline, Question, QuestionMaterialLink, Theme } from '../../types';
import { SafeMarkdown, parseInline } from '../common/SafeMarkdown';
import { QuestionMaterialLinksEditor } from './QuestionMaterialLinksEditor';
import { questionsRepository } from '../../repositories/QuestionsRepository';
import { getErrorMessage } from '../../utils/errorMessage';
import {
  parseQuestionsMarkdownText,
  buildQuestionFromImportRow,
  resolverLigacoesDoArquivo,
  QuestionImportPreview,
} from '../../utils/questionsImport';
import {
  chaveDeRepeticao,
  chavesDasQuestoes,
  completarBancaEAno,
  lerProvaEmTexto,
  previewsDaProva,
  textoEhMarkdownDeQuestoes,
  validarLoteDaProva,
} from '../../utils/provaEmTexto';

// ============================================================================
// "Importar questões" — equivalente de ImportMaterialModal para o banco de
// questões comentadas (antes desta missão não existia NENHUM import de
// arquivo aqui, só o formulário "Nova Questão", ver
// docs/editorial/PADRAO-NEXUSMED-QUESTOES.md). Diferença estrutural: um
// arquivo de conteúdo é UMA entidade com pré-visualização única; um arquivo
// de questões é um LOTE de entidades independentes, então a pré-visualização
// aqui é uma LISTA — cada linha resolve disciplina/tema e é confirmada (ou
// reportada como falha) por conta própria, nunca tudo-ou-nada por arquivo.
// ============================================================================

interface ImportQuestionsModalProps {
  disciplines: Discipline[];
  themes: Theme[];
  /** Materiais disponíveis para "Materiais cobrados por este lote" (43-B). */
  compendiums: Compendium[];
  /**
   * IMPORT-2: as questões que a Área Editorial tem carregadas. Questão do lote com o mesmo enunciado
   * (sem diferenciar maiúsculas nem espaços repetidos), banca e ano de uma delas vem desmarcada ("Já existe").
   */
  existingQuestions?: Pick<Question, 'clinicalVignette' | 'questionStem' | 'institution' | 'year'>[];
  onClose: () => void;
  onImported: () => void;
}

interface RowState {
  preview: QuestionImportPreview;
  overrideDisciplineId: string | null;
  overrideThemeId: string | null;
  /** P10: ligações que o arquivo cita ("Material > Seção"), já resolvidas; ausente = vale o material do lote. */
  fileLinks?: QuestionMaterialLink[];
  /** IMPORT-2: só as marcadas são gravadas. Nasce marcada, menos a que já existe. */
  selecionada: boolean;
  jaExiste: boolean;
}

/** De onde veio o lote: arquivo escolhido ou texto colado (IMPORT-2). */
type Origem = 'arquivo' | 'colado';

type WizardState =
  | { step: 'pick' }
  | { step: 'error'; origem: Origem; nome: string; errors: string[] }
  | {
      step: 'preview';
      origem: Origem;
      nome: string;
      rows: RowState[];
      /** Avisos do lote inteiro (numeração pulada ou repetida etc.), só do texto colado. */
      avisos: string[];
      lote?: { institution: string; year: number };
    }
  | { step: 'saving' }
  | { step: 'done'; successCount: number; attempted: number; failures: string[] };

function isRowReady(row: RowState): boolean {
  return row.preview.blockingErrors.length === 0 && row.selecionada && !!row.overrideDisciplineId && !!row.overrideThemeId;
}

export const ImportQuestionsModal: React.FC<ImportQuestionsModalProps> = ({
  disciplines,
  themes,
  compendiums,
  existingQuestions = [],
  onClose,
  onImported,
}) => {
  const [state, setState] = useState<WizardState>({ step: 'pick' });
  // 43-B: materiais que valem para todas as questões do arquivo. Ajuste por
  // questão, depois, pelo botão "Vínculo" na lista de questões.
  const [lotLinks, setLotLinks] = useState<QuestionMaterialLink[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogA11y<HTMLDivElement>({ onClose });
  // IMPORT-2: "Colar texto" — banca e ano valem para o lote inteiro.
  const [banca, setBanca] = useState('');
  const [anoTexto, setAnoTexto] = useState('');
  const [textoColado, setTextoColado] = useState('');
  const [paraTodasDisciplina, setParaTodasDisciplina] = useState('');
  const [paraTodasTema, setParaTodasTema] = useState('');
  const chavesExistentes = useMemo(() => chavesDasQuestoes(existingQuestions), [existingQuestions]);

  const loteColado = validarLoteDaProva(banca, anoTexto);
  const motivosParaDesligar = [
    ...(loteColado.ok ? [] : loteColado.motivos),
    ...(textoColado.trim() ? [] : ['Cole o texto da prova na caixa.']),
  ];

  /** Cada questão lida vira uma linha da prévia; o que o arquivo cita de material é resolvido aqui (P10). */
  const montarLinhas = (previews: QuestionImportPreview[]): RowState[] =>
    previews.map((preview) => {
      const jaExiste = chavesExistentes.has(chaveDeRepeticao(preview));
      const base = { overrideDisciplineId: preview.disciplineId, overrideThemeId: preview.themeId, selecionada: !jaExiste, jaExiste };
      // P10: a questão que cita material (e seção) no arquivo se liga a eles; o que não se acha bloqueia a linha.
      if (preview.materialLinks.length === 0) return { preview, ...base };
      const { links, erros } = resolverLigacoesDoArquivo(preview.materialLinks, compendiums);
      return { preview: { ...preview, blockingErrors: [...preview.blockingErrors, ...erros] }, ...base, fileLinks: links };
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const text = await file.text();
    const result = parseQuestionsMarkdownText(text, disciplines, themes);

    if (result.ok === false) {
      setState({ step: 'error', origem: 'arquivo', nome: `"${file.name}"`, errors: result.errors });
      return;
    }

    setState({ step: 'preview', origem: 'arquivo', nome: `"${file.name}"`, rows: montarLinhas(result.rows), avisos: [] });
  };

  const handleColar = () => {
    if (loteColado.ok === false || !textoColado.trim()) return;
    const nome = 'o texto colado';
    let previews: QuestionImportPreview[];
    let avisos: string[] = [];
    if (textoEhMarkdownDeQuestoes(textoColado)) {
      // O formato .md continua valendo colado: o que a questão traz vale, banca e ano do lote completam o que falta.
      const result = parseQuestionsMarkdownText(textoColado, disciplines, themes);
      if (result.ok === false) {
        setState({ step: 'error', origem: 'colado', nome, errors: result.errors });
        return;
      }
      previews = completarBancaEAno(result.rows, loteColado.institution, loteColado.year);
    } else {
      const prova = lerProvaEmTexto(textoColado);
      if (prova.ok === false) {
        setState({ step: 'error', origem: 'colado', nome, errors: prova.errors });
        return;
      }
      previews = previewsDaProva(prova.questoes, loteColado.institution, loteColado.year);
      avisos = prova.avisos;
    }
    setParaTodasDisciplina('');
    setParaTodasTema('');
    setState({
      step: 'preview',
      origem: 'colado',
      nome,
      rows: montarLinhas(previews),
      avisos,
      lote: { institution: loteColado.institution, year: loteColado.year },
    });
  };

  const updateRow = (index: number, patch: Partial<RowState>) => {
    if (state.step !== 'preview') return;
    const rows = state.rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    setState({ ...state, rows });
  };

  /** "Aplicar a todas": Disciplina e Tema escolhidos uma vez valem para todas as questões que podem ser gravadas. */
  const aplicarATodas = () => {
    if (state.step !== 'preview' || !paraTodasDisciplina || !paraTodasTema) return;
    const rows = state.rows.map((r) =>
      r.preview.blockingErrors.length > 0
        ? r
        : { ...r, overrideDisciplineId: paraTodasDisciplina, overrideThemeId: paraTodasTema }
    );
    setState({ ...state, rows });
  };

  const readyCount = state.step === 'preview' ? state.rows.filter(isRowReady).length : 0;

  const handleConfirm = async () => {
    if (state.step !== 'preview') return;
    const rows = state.rows;
    setState({ step: 'saving' });

    let successCount = 0;
    const failures: string[] = [];
    for (const row of rows) {
      if (!isRowReady(row)) continue;
      try {
        const links = row.fileLinks ?? lotLinks;
        const question = {
          ...buildQuestionFromImportRow(row.preview, row.overrideDisciplineId, row.overrideThemeId),
          materialLinks: links,
          // "O" material da questão (cartão, caderno de erros, flashcard):
          // o primeiro do lote, como em setQuestionMaterialLinks.
          compendiumRefId: links[0]?.materialId ?? '',
          compendiumSectionId: links[0]?.sectionId,
        };
        await questionsRepository.importQuestionDraft(question);
        successCount++;
      } catch (err) {
        failures.push(`Questão ${row.preview.index}: ${getErrorMessage(err)}`);
      }
    }

    if (successCount > 0) onImported();
    setState({ step: 'done', successCount, attempted: readyCount, failures });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-labelledby="import-questions-title"
        aria-modal="true"
        data-testid="import-questions-modal"
        className="w-full max-w-3xl my-4 sm:my-8 bg-white dark:bg-[#0F172A] rounded-2xl border-2 border-teal-500/50 dark:border-teal-500/60 p-6 sm:p-8 elev-md space-y-6 text-xs animate-in fade-in"
      >
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-[#243452] pb-3">
          <div className="flex items-center gap-2">
            <FileUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <h3 id="import-questions-title" className="font-serif-reading text-lg font-bold text-stone-900 dark:text-slate-100">
              Importar questões
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-slate-200 hover:bg-stone-100 dark:hover:bg-[#142038] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {state.step === 'pick' && (
          <div className="space-y-4">
            <p className="text-stone-600 dark:text-slate-400">
              Selecione um arquivo <code>.md</code> com um lote de questões — cada questão começa com um
              heading <code>## Questão N</code>. O sistema vai conferir cada uma e mostrar uma
              pré-visualização antes de criar qualquer coisa — nada é gravado até você confirmar. Cada
              questão criada nasce em <strong>rascunho</strong>: revisão/atestação e publicação continuam
              sendo etapas manuais e separadas, por questão.
            </p>
            <label
              htmlFor="import-questions-file-input"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-stone-300 dark:border-[#243452] rounded-xl py-10 cursor-pointer hover:border-teal-500 hover:bg-teal-50/40 dark:hover:bg-teal-950/20 transition-colors"
            >
              <Upload className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              <span className="font-bold text-stone-700 dark:text-slate-300">Selecionar arquivo</span>
              <span className="text-stone-400">.md ou .markdown</span>
            </label>
            <input
              id="import-questions-file-input"
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown"
              onChange={handleFileChange}
              className="hidden"
            />

            <section aria-labelledby="import-questions-colar-titulo" className="space-y-3 border-t border-stone-200 dark:border-[#243452] pt-4">
              <h4 id="import-questions-colar-titulo" className="font-bold text-stone-800 dark:text-slate-200 text-sm">
                Colar texto
              </h4>
              <p className="text-stone-600 dark:text-slate-400">
                Cole o texto de uma prova de residência (como sai do PDF). O NexusMed separa questão por questão —
                enunciado, alternativas e gabarito — e mostra a prévia antes de gravar. A banca e o ano valem para a
                prova inteira. Também serve o texto no formato <code>.md</code> acima.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem] gap-3">
                <div>
                  <label htmlFor="import-questions-banca" className="font-semibold text-stone-600 dark:text-slate-400 block mb-0.5">
                    Banca / instituição
                  </label>
                  <input
                    id="import-questions-banca"
                    type="text"
                    value={banca}
                    onChange={(e) => setBanca(e.target.value)}
                    placeholder="Ex.: ENARE, USP-SP"
                    autoComplete="off"
                    className="w-full p-2 rounded-lg border border-stone-300 dark:border-[#243452] bg-white dark:bg-[#0B1220] text-stone-900 dark:text-slate-100 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="import-questions-ano" className="font-semibold text-stone-600 dark:text-slate-400 block mb-0.5">
                    Ano
                  </label>
                  <input
                    id="import-questions-ano"
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={anoTexto}
                    onChange={(e) => setAnoTexto(e.target.value)}
                    placeholder="2025"
                    autoComplete="off"
                    className="w-full p-2 rounded-lg border border-stone-300 dark:border-[#243452] bg-white dark:bg-[#0B1220] text-stone-900 dark:text-slate-100 text-xs"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="import-questions-texto" className="font-semibold text-stone-600 dark:text-slate-400 block mb-0.5">
                  Texto da prova
                </label>
                <textarea
                  id="import-questions-texto"
                  rows={8}
                  value={textoColado}
                  onChange={(e) => setTextoColado(e.target.value)}
                  placeholder={'1. Enunciado da questão...\nA) alternativa\nB) alternativa\n...\n\nGabarito\n1-B'}
                  spellCheck={false}
                  className="w-full p-2 rounded-lg border border-stone-300 dark:border-[#243452] bg-white dark:bg-[#0B1220] text-stone-900 dark:text-slate-100 text-xs font-mono"
                />
              </div>
              {motivosParaDesligar.length > 0 && (
                <ul id="import-questions-colar-motivo" className="list-disc list-inside text-amber-700 dark:text-amber-400 space-y-0.5">
                  {motivosParaDesligar.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleColar}
                  disabled={motivosParaDesligar.length > 0}
                  aria-describedby={motivosParaDesligar.length > 0 ? 'import-questions-colar-motivo' : undefined}
                  className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:hover:bg-teal-500 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Ler texto e ver a prévia
                </button>
              </div>
            </section>
          </div>
        )}

        {state.step === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-bold text-rose-700 dark:text-rose-300">
                  Não foi possível importar {state.nome}.
                </p>
                <ul className="list-disc list-inside text-rose-700 dark:text-rose-300 space-y-1">
                  {state.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setState({ step: 'pick' })}
                className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:hover:bg-teal-500 text-xs font-bold transition-all cursor-pointer"
              >
                {state.origem === 'colado' ? 'Voltar ao texto colado' : 'Escolher outro arquivo'}
              </button>
            </div>
          </div>
        )}

        {state.step === 'preview' && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 text-sky-800 dark:text-sky-300">
              {state.rows.length} questão(ões) encontrada(s) {state.origem === 'colado' ? 'no texto colado' : `em ${state.nome}`}. Cada uma vira um{' '}
              <strong>rascunho</strong> independente — revise disciplina/tema onde marcado antes de
              confirmar.
              {state.lote && (
                <p className="mt-1 font-semibold" data-testid="import-questions-lote">
                  Banca / instituição do lote: {state.lote.institution} · Ano: {state.lote.year}
                </p>
              )}
            </div>

            {state.avisos.length > 0 && (
              <ul
                data-testid="import-questions-avisos"
                className="list-disc list-inside p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 space-y-0.5"
              >
                {state.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}

            {state.origem === 'colado' && (
              <div
                data-testid="import-questions-aplicar-todas"
                className="flex flex-col sm:flex-row sm:items-end gap-2 p-3 rounded-lg border border-stone-200 dark:border-[#243452]"
              >
                <div className="flex-1">
                  <label htmlFor="import-questions-todas-disciplina" className="font-semibold text-stone-600 dark:text-slate-400 block mb-0.5">
                    Disciplina para todas
                  </label>
                  <select
                    id="import-questions-todas-disciplina"
                    value={paraTodasDisciplina}
                    onChange={(e) => {
                      setParaTodasDisciplina(e.target.value);
                      setParaTodasTema('');
                    }}
                    className="w-full p-1.5 rounded-lg border border-stone-300 dark:border-[#243452] bg-white dark:bg-[#0B1220] text-stone-900 dark:text-slate-100 text-[11px]"
                  >
                    <option value="">selecione</option>
                    {disciplines.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label htmlFor="import-questions-todas-tema" className="font-semibold text-stone-600 dark:text-slate-400 block mb-0.5">
                    Tema para todas
                  </label>
                  <select
                    id="import-questions-todas-tema"
                    value={paraTodasTema}
                    onChange={(e) => setParaTodasTema(e.target.value)}
                    disabled={!paraTodasDisciplina}
                    className="w-full p-1.5 rounded-lg border border-stone-300 dark:border-[#243452] bg-white dark:bg-[#0B1220] text-stone-900 dark:text-slate-100 text-[11px] disabled:opacity-50"
                  >
                    <option value="">selecione</option>
                    {themes
                      .filter((t) => t.disciplineId === paraTodasDisciplina)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={aplicarATodas}
                  disabled={!paraTodasDisciplina || !paraTodasTema}
                  className="px-3 py-1.5 rounded-lg border border-teal-600 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Aplicar a todas
                </button>
              </div>
            )}

            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {state.rows.map((row, i) => {
                const { preview } = row;
                const blocked = preview.blockingErrors.length > 0;
                const availableThemes = themes.filter((t) => t.disciplineId === row.overrideDisciplineId);
                // Texto colado: Disciplina e Tema ficam sempre em lista, para trocar depois do "Aplicar a todas".
                const editavel = state.origem === 'colado';
                return (
                  <div
                    key={i}
                    data-testid={`import-questions-row-${preview.index}`}
                    className={`p-3.5 rounded-xl border space-y-2.5 ${
                      blocked
                        ? 'border-rose-300 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/20'
                        : 'border-stone-200 dark:border-[#243452] bg-stone-50/60 dark:bg-[#0B1220]/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-stone-800 dark:text-slate-200">
                        Questão {preview.index}
                        <span className="font-normal text-stone-500 dark:text-slate-400">
                          {' '}
                          — {preview.questionStem ? preview.questionStem.slice(0, 90) : '(sem comando)'}
                          {preview.questionStem.length > 90 ? '…' : ''}
                        </span>
                      </p>
                      {blocked ? (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          {preview.anulada ? 'Anulada' : 'Bloqueada'}
                        </span>
                      ) : !row.selecionada ? (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-200 dark:bg-slate-800 text-stone-700 dark:text-slate-300 border border-stone-300 dark:border-slate-700">
                          Desmarcada
                        </span>
                      ) : isRowReady(row) ? (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          Pronta
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          Falta disciplina/tema
                        </span>
                      )}
                    </div>

                    {editavel && (
                      <p className="text-stone-500 dark:text-slate-400">
                        Banca: {preview.institution || '—'} · Ano: {preview.year || '—'}
                      </p>
                    )}

                    {row.jaExiste && (
                      <div className="flex flex-wrap items-center gap-2 text-amber-700 dark:text-amber-400">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800">
                          Já existe
                        </span>
                        <span>
                          Mesmo enunciado, banca e ano de uma questão que já está no sistema — vem desmarcada.
                        </span>
                      </div>
                    )}

                    {!blocked && (
                      <label className="flex items-center gap-2 text-stone-700 dark:text-slate-300 cursor-pointer w-fit">
                        <input
                          type="checkbox"
                          checked={row.selecionada}
                          onChange={(e) => updateRow(i, { selecionada: e.target.checked })}
                          className="w-3.5 h-3.5 accent-teal-600"
                        />
                        Importar a questão {preview.index}
                      </label>
                    )}

                    {!blocked && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <span className="font-semibold text-stone-600 dark:text-slate-400 block mb-0.5">
                            Disciplina
                          </span>
                          {row.overrideDisciplineId && !editavel ? (
                            <p className="text-stone-900 dark:text-slate-100">
                              {disciplines.find((d) => d.id === row.overrideDisciplineId)?.name ?? preview.disciplineName}
                            </p>
                          ) : (
                            <select
                              value={row.overrideDisciplineId ?? ''}
                              aria-label={`Disciplina da questão ${preview.index}`}
                              onChange={(e) => updateRow(i, { overrideDisciplineId: e.target.value, overrideThemeId: null })}
                              className={`w-full p-1.5 rounded-lg border bg-white text-stone-900 dark:text-slate-100 text-[11px] ${
                                row.overrideDisciplineId
                                  ? 'border-stone-300 dark:border-[#243452] dark:bg-[#0B1220]'
                                  : 'border-rose-300 dark:border-rose-800 dark:bg-rose-950/30'
                              }`}
                            >
                              <option value="" disabled>
                                {preview.disciplineName ? `"${preview.disciplineName}" não encontrada` : 'selecione'}
                              </option>
                              {disciplines.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-stone-600 dark:text-slate-400 block mb-0.5">Tema</span>
                          {row.overrideThemeId && !editavel ? (
                            <p className="text-stone-900 dark:text-slate-100">
                              {themes.find((t) => t.id === row.overrideThemeId)?.name ?? preview.themeName}
                            </p>
                          ) : (
                            <select
                              value={row.overrideThemeId ?? ''}
                              aria-label={`Tema da questão ${preview.index}`}
                              onChange={(e) => updateRow(i, { overrideThemeId: e.target.value })}
                              disabled={!row.overrideDisciplineId}
                              className={`w-full p-1.5 rounded-lg border bg-white text-stone-900 dark:text-slate-100 text-[11px] disabled:opacity-50 ${
                                row.overrideThemeId
                                  ? 'border-stone-300 dark:border-[#243452] dark:bg-[#0B1220]'
                                  : 'border-rose-300 dark:border-rose-800 dark:bg-rose-950/30'
                              }`}
                            >
                              <option value="" disabled>
                                {preview.themeName ? `"${preview.themeName}" não encontrado` : 'selecione'}
                              </option>
                              {availableThemes.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    )}

                    {preview.blockingErrors.length > 0 && (
                      <ul className="list-disc list-inside text-rose-700 dark:text-rose-300 space-y-0.5">
                        {preview.blockingErrors.map((e, ei) => (
                          <li key={ei}>{e}</li>
                        ))}
                      </ul>
                    )}

                    <details className="text-stone-700 dark:text-slate-300">
                      <summary className="cursor-pointer font-semibold">Ver enunciado e alternativas</summary>
                      <div className="mt-1.5 space-y-2">
                        {preview.clinicalVignette && <SafeMarkdown content={preview.clinicalVignette} />}
                        {preview.questionStem && <SafeMarkdown content={preview.questionStem} />}
                        {preview.options.length > 0 && (
                          <ul className="space-y-1">
                            {preview.options.map((o) => (
                              <li key={o.letter} className={o.isCorrect ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''}>
                                {o.letter}) {parseInline(o.text)}
                                {o.isCorrect && <span> — alternativa correta (gabarito)</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </details>

                    {preview.missingFields.length > 0 && (
                      <details className="text-amber-700 dark:text-amber-400">
                        <summary className="cursor-pointer font-semibold">
                          {preview.missingFields.length} campo(s) ausente(s) ou usando padrão
                        </summary>
                        <ul className="list-disc list-inside mt-1 space-y-0.5">
                          {preview.missingFields.map((f, fi) => (
                            <li key={fi}>{f}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3.5 rounded-xl border border-stone-200 dark:border-[#243452]">
              <QuestionMaterialLinksEditor
                htmlId="import-questions-lot-materials"
                label="Materiais cobrados por este lote"
                helperText="Valem para as questões do arquivo que não citam material em “Materiais cobertos” (as que citam, com ou sem seção, ficam com o que o arquivo diz). Ajuste por questão depois, pelo botão Vínculo na lista de questões. Sem material escolhido, as questões entram sem vínculo."
                compendiums={compendiums}
                value={lotLinks}
                onChange={setLotLinks}
                withoutSections
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200 dark:border-[#243452]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-stone-200 dark:border-[#243452] text-stone-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-[#142038] text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={readyCount === 0}
                className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:hover:bg-teal-500 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Importar {readyCount} rascunho(s)
              </button>
            </div>
          </div>
        )}

        {state.step === 'saving' && <p className="text-stone-600 dark:text-slate-400">Importando questões...</p>}

        {state.step === 'done' && (
          <div className="space-y-4">
            <div
              className={`flex items-start gap-3 p-4 rounded-xl border ${
                state.failures.length === 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
              }`}
            >
              {state.failures.length === 0 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-2">
                <p
                  className={
                    state.failures.length === 0
                      ? 'text-emerald-800 dark:text-emerald-300'
                      : 'text-amber-800 dark:text-amber-300'
                  }
                >
                  {state.successCount} de {state.attempted} rascunho(s) criado(s) com sucesso. Cada um está
                  pendente de revisão — a publicação continua sendo uma ação manual separada, por questão.
                </p>
                {state.failures.length > 0 && (
                  <ul className="list-disc list-inside text-amber-800 dark:text-amber-300 space-y-0.5">
                    {state.failures.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:hover:bg-teal-500 text-xs font-bold transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportQuestionsModal;
