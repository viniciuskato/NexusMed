import React, { useState, useMemo, useEffect } from 'react';
import {
  HelpCircle,
  Search,
  Timer,
  BookOpen,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Keyboard,
  Building2,
} from 'lucide-react';
import { Question, Discipline, Theme, QuestionAnswerRecord, QuestionReactionValue, Compendium, LastReadingSession } from '../../types';
import { bookmarksRepository } from '../../repositories/BookmarksRepository';
import { answersRepository } from '../../repositories/AnswersRepository';
import { questionReactionsRepository } from '../../repositories/QuestionReactionsRepository';
import { QuestionCard } from './QuestionCard';
import { SCOPE_UNLINKED } from '../../services/thematicPacks';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useScrollMemory } from '../../hooks/useScrollMemory';

interface QuestionsViewProps {
  questions: Question[];
  disciplines: Discipline[];
  themes: Theme[];
  compendiums?: Compendium[];
  onOpenCompendium: (compendiumId?: string, sectionId?: string, originQuestionId?: string) => void;
  onOpenCreateSimulado: () => void;
  filterThemeId?: string;
  /**
   * Escopo de material (Prompt 22-A): id de um compêndio — mostra só as questões
   * que o referenciam explicitamente (`compendiumRefId`) — ou `SCOPE_UNLINKED`,
   * que mostra só as questões SEM material declarado. Diferente dos filtros da
   * barra, este recorte vem da navegação (pack do Estudo Temático) e não é
   * persistido: sair pelo menu principal o descarta.
   */
  filterCompendiumId?: string;
  /** Presente quando se chegou aqui por um pack — mostra o retorno explícito. */
  onReturnToThematicStudy?: () => void;
  focusQuestionId?: string;
  /**
   * Status inicial dos pills de filtro (ex.: 'incorrect' ao chegar vindo de
   * "Treinar Apenas Questões Erradas" no Caderno de Erros — ver App.tsx,
   * Prompt 10-A). Só define o valor INICIAL; o usuário pode trocar depois
   * normalmente. Undefined mantém o padrão 'all'.
   */
  initialStatusFilter?: 'all' | 'unanswered' | 'correct' | 'incorrect' | 'bookmarked';
  returnToCompendiumContext?: LastReadingSession | null;
  onReturnToCompendium?: () => void;
}

export const QuestionsView: React.FC<QuestionsViewProps> = ({
  questions,
  disciplines,
  themes,
  compendiums,
  onOpenCompendium,
  onOpenCreateSimulado,
  filterThemeId,
  filterCompendiumId,
  onReturnToThematicStudy,
  focusQuestionId,
  initialStatusFilter,
  returnToCompendiumContext,
  onReturnToCompendium,
}) => {
  // Persistido para sobreviver à troca de seção do app (App.tsx desmonta
  // QuestionsView ao navegar pra outra view). filterThemeId/initialStatusFilter
  // são contexto explícito de navegação (ex. veio de "Treinar questões
  // erradas") e têm prioridade sobre o filtro lembrado — ver efeitos abaixo.
  const [selectedDiscipline, setSelectedDiscipline] = usePersistedState<string>('questions_discipline', 'all');
  const [selectedTheme, setSelectedTheme] = usePersistedState<string>('questions_theme', filterThemeId || 'all');
  const [selectedDifficulty, setSelectedDifficulty] = usePersistedState<string>('questions_difficulty', 'all');
  const [selectedInstitution, setSelectedInstitution] = usePersistedState<string>('questions_institution', 'all');
  const [selectedStatus, setSelectedStatus] = usePersistedState<'all' | 'unanswered' | 'correct' | 'incorrect' | 'bookmarked'>(
    'questions_status',
    initialStatusFilter || 'all'
  );
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  useScrollMemory('questions');

  useEffect(() => {
    if (filterThemeId) setSelectedTheme(filterThemeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterThemeId]);

  useEffect(() => {
    if (initialStatusFilter) setSelectedStatus(initialStatusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStatusFilter]);

  const [answers, setAnswers] = useState<Record<string, QuestionAnswerRecord>>({});
  const [bookmarks, setBookmarks] = useState<{
    questions: string[];
    compendiums: string[];
    flashcards: string[];
  }>({ questions: [], compendiums: [], flashcards: [] });
  // Reações (👍/👎) de TODAS as questões do usuário, buscadas uma única vez
  // aqui (Prompt 10-A) — antes, cada <QuestionCard> pedia a própria reação
  // individualmente ao montar, o que com os filtros "Todas"/"Erros" (até 393
  // cartões simultâneos, sem paginação) virava centenas de requisições
  // concorrentes pela mesma informação que cabe numa única consulta.
  const [reactions, setReactions] = useState<Record<string, QuestionReactionValue>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [nextAnswers, nextBookmarks, nextReactions] = await Promise.all([
        answersRepository.getAnswers(),
        bookmarksRepository.getBookmarks(),
        questionReactionsRepository.getMyReactions(),
      ]);
      if (cancelled) return;
      setAnswers(nextAnswers);
      setBookmarks(nextBookmarks);
      setReactions(nextReactions);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If focusQuestionId exists, locate it
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      // O escopo de material é o recorte mais forte: ele define QUAIS questões
      // existem nesta visita, antes de qualquer filtro escolhido pelo usuário
      // (e antes até do foco em questão única, que não pode furar o escopo).
      if (filterCompendiumId) {
        const ref = (q.compendiumRefId ?? '').trim();
        if (filterCompendiumId === SCOPE_UNLINKED) {
          if (ref !== '') return false;
        } else if (ref !== filterCompendiumId) {
          return false;
        }
      }

      if (focusQuestionId && q.id === focusQuestionId) return true;

      if (selectedDiscipline !== 'all' && q.disciplineId !== selectedDiscipline) {
        return false;
      }
      if (selectedTheme !== 'all' && q.themeId !== selectedTheme) {
        return false;
      }
      if (selectedDifficulty !== 'all' && q.difficulty !== selectedDifficulty) {
        return false;
      }
      if (selectedInstitution !== 'all' && !q.institution.toLowerCase().includes(selectedInstitution.toLowerCase())) {
        return false;
      }

      // Status filter
      const ans = answers[q.id];
      if (selectedStatus === 'unanswered' && ans) return false;
      if (selectedStatus === 'correct' && (!ans || !ans.isCorrect)) return false;
      if (selectedStatus === 'incorrect' && (!ans || ans.isCorrect)) return false;
      if (selectedStatus === 'bookmarked' && !bookmarks.questions.includes(q.id)) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesStem = q.questionStem.toLowerCase().includes(query);
        const matchesVignette = q.clinicalVignette.toLowerCase().includes(query);
        const matchesInstitution = q.institution.toLowerCase().includes(query);
        const matchesTags = q.tags.some((t) => t.toLowerCase().includes(query));
        return matchesStem || matchesVignette || matchesInstitution || matchesTags;
      }

      return true;
    });
  }, [
    questions,
    selectedDiscipline,
    selectedTheme,
    selectedDifficulty,
    selectedInstitution,
    selectedStatus,
    searchQuery,
    answers,
    bookmarks,
    focusQuestionId,
    filterCompendiumId,
  ]);

  const mistakesCount = (Object.values(answers) as QuestionAnswerRecord[]).filter((a) => !a.isCorrect).length;

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6">
      {/* ── Retorno ao pack do Estudo Temático ─────────────────────── */}
      {onReturnToThematicStudy && (
        <div
          id="questions-return-to-pack"
          className="p-3 sm:px-4 sm:py-2.5 rounded-2xl bg-slate-900/5 dark:bg-teal-950/40 border border-slate-300 dark:border-teal-800/50 elev-xs flex items-center justify-between gap-3"
        >
          <p className="text-xs text-slate-700 dark:text-slate-200 min-w-0">
            <span className="font-bold">Escopo do Estudo Temático:</span>{' '}
            {filterCompendiumId === SCOPE_UNLINKED
              ? 'questões do tema sem material associado'
              : 'questões que referenciam o material do pack'}
            .
          </p>
          <button
            type="button"
            onClick={onReturnToThematicStudy}
            className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-teal-600 hover:bg-slate-800 dark:hover:bg-teal-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao Estudo Temático</span>
          </button>
        </div>
      )}

      {/* ── Retorno ao Compêndio em Leitura ────────────────────────── */}
      {returnToCompendiumContext && onReturnToCompendium && (
        <div className="p-3 sm:px-4 sm:py-2.5 rounded-2xl bg-teal-500/10 dark:bg-teal-950/40 border border-teal-500/30 dark:border-teal-700/40 elev-xs flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookOpen className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <div className="truncate text-xs">
              <span className="font-bold text-slate-900 dark:text-slate-100">Leitura em andamento:</span>{' '}
              <span className="text-teal-700 dark:text-teal-300 font-medium">
                {returnToCompendiumContext.compendiumTitle}
                {returnToCompendiumContext.sectionTitle && ` · ${returnToCompendiumContext.sectionTitle}`}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onReturnToCompendium}
            className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Voltar à Leitura</span>
            <span className="sm:hidden">Voltar</span>
          </button>
        </div>
      )}

      {/* Top Header (Recolhido em Modo Foco) */}
      {!isFocusMode && (
        <div className="bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 rounded-3xl p-5 sm:p-6 text-white elev-sm border border-teal-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[11px] font-semibold border border-teal-400/30">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>+35 XP por acerto · Justificativa comentada</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Banco de Questões Médicas
            </h1>
            <p className="text-slate-300 text-xs max-w-xl leading-relaxed">
              Treino deliberado com análise detalhada de distratores, classificação de erros e correlação teórica.
            </p>
          </div>

          <button
            onClick={onOpenCreateSimulado}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-extrabold text-xs elev-md shadow-teal-500/20 transition-all flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <Timer className="w-4 h-4" />
            <span>Criar Simulado Personalizado</span>
          </button>
        </div>
      )}

      {/* Multi-Filter Bar (Recolhido em Modo Foco) */}
      {!isFocusMode && (
        <div className="bg-white dark:bg-[#0E1726] rounded-3xl border border-slate-300/80 dark:border-[#243652] p-5 elev-xs space-y-4">
        {/* Top filter row: Search & Status Pills */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="w-full md:w-96 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Pesquisar por vinheta clínica, banca (USP, ENARE)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-[#263750] bg-white dark:bg-[#142038] focus:bg-white dark:focus:bg-[#1A2845] focus:outline-none focus:ring-2 focus:ring-teal-500/30 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 shadow-2xs"
            />
          </div>

          {/* Status buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto text-xs pb-1 md:pb-0">
            {[
              { id: 'all', label: 'Todas as Questões' },
              { id: 'unanswered', label: 'Não Respondidas' },
              { id: 'incorrect', label: `Erros (${mistakesCount})` },
              { id: 'correct', label: 'Acertadas' },
              { id: 'bookmarked', label: 'Favoritas' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setSelectedStatus(st.id as typeof selectedStatus)}
                className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all cursor-pointer ${
                  selectedStatus === st.id
                    ? 'bg-slate-900 dark:bg-teal-600 text-white elev-xs font-bold'
                    : 'bg-white dark:bg-[#142038] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-[#263750] hover:bg-slate-50 dark:hover:bg-[#1A2845] hover:border-slate-400 shadow-2xs'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom filter row: Discipline, Theme, Difficulty, Institutions */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
          {/* Discipline Select */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-600 dark:text-slate-400">Disciplina:</span>
            <select
              value={selectedDiscipline}
              onChange={(e) => {
                setSelectedDiscipline(e.target.value);
                setSelectedTheme('all');
              }}
              className="p-1.5 rounded-lg border border-slate-300 dark:border-[#263750] bg-white dark:bg-[#142038] text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/30 shadow-2xs cursor-pointer"
            >
              <option value="all">Todas</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Theme Select */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-600 dark:text-slate-400">Tema:</span>
            <select
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value)}
              className="p-1.5 rounded-lg border border-slate-300 dark:border-[#263750] bg-white dark:bg-[#142038] text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/30 max-w-xs truncate shadow-2xs cursor-pointer"
            >
              <option value="all">Todos os Temas</option>
              {themes
                .filter((t) => selectedDiscipline === 'all' || t.disciplineId === selectedDiscipline)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Difficulty Select */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-600 dark:text-slate-400">Dificuldade:</span>
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="p-1.5 rounded-lg border border-slate-300 dark:border-[#263750] bg-white dark:bg-[#142038] text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/30 shadow-2xs cursor-pointer"
            >
              <option value="all">Todas</option>
              <option value="facil">Fácil</option>
              <option value="medio">Média</option>
              <option value="dificil">Difícil</option>
            </select>
          </div>

          {/* Reset Filters button */}
          {(selectedDiscipline !== 'all' ||
            selectedTheme !== 'all' ||
            selectedDifficulty !== 'all' ||
            selectedInstitution !== 'all' ||
            selectedStatus !== 'all' ||
            searchQuery) && (
            <button
              onClick={() => {
                setSelectedDiscipline('all');
                setSelectedTheme('all');
                setSelectedDifficulty('all');
                setSelectedInstitution('all');
                setSelectedStatus('all');
                setSearchQuery('');
              }}
              className="text-teal-700 dark:text-teal-400 hover:underline font-semibold ml-auto cursor-pointer"
            >
              Limpar Filtros
            </button>
          )}
        </div>

        {/* Quick Institution Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-slate-200/80 dark:border-slate-800/80 text-xs">
          <div className="flex items-center gap-1.5 mr-1 text-slate-500 dark:text-slate-400 font-bold">
            <Building2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>Banca Rápida:</span>
          </div>
          {[
            { id: 'all', label: 'Todas as Bancas' },
            { id: 'USP', label: 'USP' },
            { id: 'ENARE', label: 'ENARE' },
            { id: 'UNIFESP', label: 'UNIFESP' },
            { id: 'UNICAMP', label: 'UNICAMP' },
            { id: 'SUS-SP', label: 'SUS-SP' },
            { id: 'SURCE', label: 'SURCE' },
            { id: 'AMRIGS', label: 'AMRIGS' },
          ].map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedInstitution(b.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                selectedInstitution === b.id
                  ? 'bg-teal-600 dark:bg-teal-500 text-white font-bold shadow-2xs'
                  : 'bg-slate-100 dark:bg-[#142038] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#1A2845]'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Results Header Count & Focus Mode Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 px-2">
        <div className="flex items-center gap-3">
          <span>
            Exibindo <strong className="text-slate-800 dark:text-slate-200">{filteredQuestions.length} questões</strong>
          </span>
          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-300">
            <Keyboard className="w-3 h-3 text-teal-600 dark:text-teal-400" />
            <span>Atalhos: [A-E] Alternativas · [Enter] Confirmar</span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setIsFocusMode(!isFocusMode)}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer border ${
              isFocusMode
                ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-400 dark:border-teal-600 text-teal-700 dark:text-teal-300'
                : 'bg-white dark:bg-[#0E1726] border-slate-300 dark:border-[#243652] text-slate-700 dark:text-slate-300 hover:border-teal-500'
            }`}
          >
            {isFocusMode ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>Expandir Painel</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>Modo Foco Zen</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Questions Stack */}
      {filteredQuestions.length === 0 ? (
        <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#243452] p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
          <HelpCircle className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
            Nenhuma questão encontrada com estes filtros.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Tente ajustar a disciplina ou status selecionado.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredQuestions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              discipline={disciplines.find((d) => d.id === q.disciplineId)}
              theme={themes.find((t) => t.id === q.themeId)}
              compendiums={compendiums}
              onOpenCompendium={onOpenCompendium}
              hydrated={{
                answer: answers[q.id] ?? null,
                bookmarked: bookmarks.questions.includes(q.id),
                reaction: reactions[q.id] ?? null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
