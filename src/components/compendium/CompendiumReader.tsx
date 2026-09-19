import {
  sourceVerificationLabel,
  formatToAbntCitation,
} from '../../utils/bibliographicSources';
import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  Clock,
  HelpCircle,
  Layers,
  Lightbulb,
  AlertTriangle,
  AlertCircle,
  MessageSquare,
  List,
  X,
  Sparkles,
  BookOpen,
  ExternalLink,
  MoreHorizontal,
  Copy,
  Check,
  GraduationCap,
} from 'lucide-react';
import { Compendium, CompendiumSection, Discipline, Theme } from '../../types';
import { StorageService } from '../../services/storage';
import { bookmarksRepository } from '../../repositories/BookmarksRepository';
import { notesRepository } from '../../repositories/NotesRepository';
import { flashcardsRepository } from '../../repositories/FlashcardsRepository';
import { readingProgressRepository } from '../../repositories/ReadingProgressRepository';
import { SafeMarkdown } from '../common/SafeMarkdown';
import { ContextualFeedbackPopover } from '../feedback/ContextualFeedbackPopover';
import { useScrollMemory } from '../../hooks/useScrollMemory';

interface CompendiumReaderProps {
  compendium: Compendium;
  disciplines: Discipline[];
  themes: Theme[];
  onBack: () => void;
  onOpenQuestionsForTheme: (themeId: string) => void;
  onOpenFlashcardsForTheme: (themeId: string) => void;
  targetSectionId?: string;
  /**
   * Chamado uma vez, logo depois de consumir um targetSectionId (pulo
   * intencional pra uma seção específica). O chamador deve limpar o valor
   * que originou targetSectionId — se ficar setado pra sempre, useScrollMemory
   * fica desligado (ready=false) em todo remount futuro deste compêndio,
   * mesmo muito depois do pulo já ter acontecido (bug relatado pelo
   * usuário: memória de rolagem parava de funcionar depois de usar o
   * índice uma vez).
   */
  onSectionJumpHandled?: () => void;
  returnToQuestionsContext?: {
    view: string;
    questionId?: string;
    label?: string;
  } | null;
  onReturnToQuestions?: () => void;
}

export const CompendiumReader: React.FC<CompendiumReaderProps> = ({
  compendium,
  disciplines,
  themes,
  onBack,
  onOpenQuestionsForTheme,
  onOpenFlashcardsForTheme,
  targetSectionId,
  onSectionJumpHandled,
  returnToQuestionsContext,
  onReturnToQuestions,
}) => {
  const discipline = disciplines.find((d) => d.id === compendium.disciplineId);
  const theme = themes.find((t) => t.id === compendium.themeId);

  const [activeSectionId, setActiveSectionId] = useState<string>(
    targetSectionId || compendium.sections[0]?.id || ''
  );
  const [readSectionIds, setReadSectionIds] = useState<string[]>([]);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [userNote, setUserNote] = useState('');
  const [showNoteDrawer, setShowNoteDrawer] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [isIndexOpen, setIsIndexOpen] = useState(false);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [copiedRefIdx, setCopiedRefIdx] = useState<number | null>(null);
  const [returnScrollY, setReturnScrollY] = useState<number | null>(null);
  const [highlightedRefId, setHighlightedRefId] = useState<string | null>(null);
  const moreMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Só restaura a posição de rolagem quando não veio de um targetSectionId
  // explícito (ex. clicou num item específico do índice em outra tela) —
  // nesse caso o pulo intencional pra seção tem prioridade sobre a memória.
  useScrollMemory(`compendium-reader:${compendium.id}`, !targetSectionId);

  // Clique em citação inline (`[N](#ref-N)`, gerado pelo SafeMarkdown a
  // partir do conteúdo do compêndio): rolagem suave até a referência em vez
  // do salto instantâneo do navegador, guarda a posição de leitura pra um
  // botão "Voltar à leitura", e destaca o card por alguns segundos.
  const handleContentClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a[href^="#ref-"]') as HTMLAnchorElement | null;
    if (!link) return;
    const refId = link.getAttribute('href')?.slice(1);
    if (!refId) return;
    const refElement = document.getElementById(refId);
    if (!refElement) return;

    e.preventDefault();
    setReturnScrollY(window.scrollY);
    refElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setHighlightedRefId(refId);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setHighlightedRefId(null), 2500);
  };

  const handleReturnToReading = () => {
    if (returnScrollY === null) return;
    window.scrollTo({ top: returnScrollY, behavior: 'smooth' });
    setReturnScrollY(null);
  };

  const handleCopyAbnt = (e: React.MouseEvent, text: string, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedRefIdx(idx);
    setTimeout(() => setCopiedRefIdx(null), 2500);
  };

  // Fechar o menu "Mais ações" (mobile) com Escape e devolver o foco ao gatilho
  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMoreMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      moreMenuTriggerRef.current?.focus();
    };
  }, [isMoreMenuOpen]);

  // Track scroll percentage
  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        const current = (window.scrollY / totalHeight) * 100;
        setScrollPercent(Math.min(100, Math.max(0, current)));
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Load reading progress, bookmark and notes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [progress, bookmarks, notes] = await Promise.all([
        readingProgressRepository.getReadingProgress(),
        bookmarksRepository.getBookmarks(),
        notesRepository.getNotes(),
      ]);
      if (cancelled) return;

      const compProgress = progress[compendium.id];
      if (compProgress) {
        setReadSectionIds(compProgress.readSectionIds);
      }
      setIsBookmarked(bookmarks.compendiums.includes(compendium.id));
      setUserNote(notes[compendium.id] || '');

      if (targetSectionId) {
        setActiveSectionId(targetSectionId);
        const elem = document.getElementById(targetSectionId);
        if (elem) elem.scrollIntoView({ behavior: 'smooth' });
        // Consome o pulo intencional uma única vez — se o chamador não
        // limpar o valor que originou targetSectionId, useScrollMemory fica
        // permanentemente desligado (ready=false) em todo remount futuro
        // deste compêndio, mesmo muito depois deste pulo específico.
        onSectionJumpHandled?.();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compendium.id, targetSectionId]);

  // Persistir sessão de leitura ativa para navegação contextual fluida
  useEffect(() => {
    const sec = compendium.sections.find((s) => s.id === activeSectionId) || compendium.sections[0];
    StorageService.saveLastReadingSession({
      compendiumId: compendium.id,
      compendiumTitle: compendium.title,
      sectionId: sec?.id,
      sectionTitle: sec?.title,
      disciplineId: compendium.disciplineId,
      disciplineName: discipline?.name,
      themeId: compendium.themeId,
      themeName: theme?.name,
      updatedAt: Date.now(),
    });
  }, [compendium, activeSectionId, discipline?.name, theme?.name]);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleToggleRead = async (sectionId: string) => {
    const newPercent = await readingProgressRepository.toggleSectionRead(
      compendium.id,
      sectionId,
      compendium.sections.length
    );
    const progress = await readingProgressRepository.getReadingProgress();
    setReadSectionIds(progress[compendium.id]?.readSectionIds || []);

    if (newPercent === 100) {
      showToast('Leitura concluída com sucesso!');
    }
  };

  const handleToggleBookmark = async () => {
    const bookmarked = await bookmarksRepository.toggleBookmark('compendiums', compendium.id);
    setIsBookmarked(bookmarked);
    showToast(bookmarked ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
  };

  const handleSaveNote = async () => {
    await notesRepository.saveNote(compendium.id, userNote);
    showToast('Anotação salva com sucesso');
  };

  const handleCreateFlashcardFromSection = async (sec: CompendiumSection) => {
    await flashcardsRepository.saveFlashcard({
      id: crypto.randomUUID(),
      disciplineId: compendium.disciplineId,
      themeId: compendium.themeId,
      compendiumRefId: compendium.id,
      front: `[${discipline?.name || 'Medicina'}] ${sec.title}`,
      back: sec.keyTakeaways.join('\n• '),
      mechanismHighlight: sec.clinicalPearl || sec.keyTakeaways[0] || '',
      tags: [discipline?.name || 'Geral', theme?.name || 'Teoria', 'Compêndio'],
      difficulty: 'medio',
      isCustom: true,
      srs: {
        intervalDays: 1,
        repetitionCount: 1,
        easeFactor: 2.5,
        nextDueDate: new Date().toISOString(),
        state: 'new',
        reviewHistory: [],
      },
    });
    showToast('Flashcard criado para o seu SRS');
  };

  const scrollToSection = (secId: string) => {
    setActiveSectionId(secId);
    setIsIndexOpen(false);
    const elem = document.getElementById(secId);
    if (elem) {
      const yOffset = -80;
      const y = elem.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  // Validating metadata: omit or show "Revisão editorial pendente" if missing
  const authorDisplay = compendium.author?.trim()
    ? compendium.author
    : 'Revisão editorial pendente';

  // compendium.lastUpdated vem de materials.updated_at como ISO cru
  // (ex. "2026-09-11T14:20:36.886889+00:00") -- formata pra data legível em
  // vez de mostrar o timestamp bruto. Cai no texto original (ou no
  // fallback) se a data vier vazia ou não for parseável.
  const parsedLastUpdated = compendium.lastUpdated?.trim() ? new Date(compendium.lastUpdated) : null;
  const lastUpdatedDisplay =
    parsedLastUpdated && !Number.isNaN(parsedLastUpdated.getTime())
      ? parsedLastUpdated.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : compendium.lastUpdated?.trim() || 'Revisão editorial pendente';

  return (
    <div className="min-h-screen bg-[#F6F7F9] dark:bg-[#0B1220] text-[#172033] dark:text-[#E5E7EB] transition-colors pb-24">
      {/* ── Top Reading Progress Bar ─────────────────────────────── */}
      <div
        className="fixed top-0 left-0 h-0.5 bg-[#0F766E] dark:bg-[#14B8A6] z-50 transition-all duration-100"
        style={{ width: `${scrollPercent}%` }}
      />

      {/* ── Toast Notification ───────────────────────────────────── */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#111827] dark:bg-[#182235] text-[#E5E7EB] px-4 py-2.5 rounded-lg elev-lg border border-[#263244] text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Botão flutuante "Voltar à leitura" — aparece depois de clicar numa
          citação inline ([N](#ref-N)) e pular até a referência no rodapé.
          bottom-24 (em vez de bottom-6): o MobileBottomNav agora renderiza
          em qualquer largura de tela como um dock fixo no rodapé — bottom-6
          ficava embaixo dele, sobrepondo os botões de navegação. */}
      {returnScrollY !== null && (
        <button
          type="button"
          onClick={handleReturnToReading}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-[#0F766E] hover:bg-teal-800 dark:bg-[#14B8A6] dark:hover:bg-teal-400 text-white dark:text-[#0B1220] text-xs font-bold flex items-center gap-2 elev-lg transition-colors cursor-pointer animate-in fade-in slide-in-from-bottom-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar à leitura</span>
        </button>
      )}

      {/* ── Sticky Subheader / Top Action Bar ─────────────────────── */}
      <div className="sticky top-[var(--app-header-height)] z-20 bg-white/95 dark:bg-[#111827]/95 backdrop-blur-xs border-b border-[#E2E8F0] dark:border-[#263244] px-4 sm:px-6 py-2 transition-colors">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:flex-nowrap sm:gap-x-3 sm:gap-y-0">
          {/* Back & Breadcrumb — always the first line, shrinks to make room */}
          <div className="order-1 flex items-center gap-2.5 min-w-0 flex-1 sm:flex-initial">
            <button
              onClick={onReturnToQuestions || onBack}
              className="w-11 h-11 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-lg border border-[#E2E8F0] dark:border-[#263244] hover:bg-slate-50 dark:hover:bg-[#182235] text-[#64748B] dark:text-[#94A3B8] transition-colors shrink-0 cursor-pointer"
              title={returnToQuestionsContext?.label || 'Voltar'}
              aria-label={returnToQuestionsContext?.label || 'Voltar'}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="truncate">
              <span className="text-[11px] font-semibold text-[#0F766E] dark:text-[#14B8A6] uppercase tracking-wider block truncate">
                {discipline?.name} · {theme?.name}
              </span>
              <h2 className="text-xs sm:text-sm font-semibold text-[#172033] dark:text-[#E5E7EB] truncate">
                {compendium.title}
              </h2>
            </div>
          </div>

          {/* Botão Retornar às Questões se veio de questões, ou Resolver questões */}
          {onReturnToQuestions && returnToQuestionsContext ? (
            <button
              onClick={onReturnToQuestions}
              className="order-2 sm:order-3 shrink-0 min-h-11 sm:min-h-0 px-3.5 py-2 sm:px-3 sm:py-1.5 rounded-lg bg-[#0F766E] hover:bg-teal-800 dark:bg-[#14B8A6] dark:hover:bg-teal-400 text-white dark:text-[#0B1220] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ring-2 ring-teal-500/20"
              title={returnToQuestionsContext.label || 'Retornar às Questões'}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{returnToQuestionsContext.label || 'Retornar às Questões'}</span>
            </button>
          ) : (
            <button
              onClick={() => onOpenQuestionsForTheme(compendium.themeId)}
              className="order-2 sm:order-3 shrink-0 min-h-11 sm:min-h-0 px-3.5 py-2 sm:px-3 sm:py-1.5 rounded-lg bg-[#0F766E] hover:bg-teal-800 dark:bg-[#14B8A6] dark:hover:bg-teal-400 text-white dark:text-[#0B1220] text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Resolver questões</span>
            </button>
          )}

          {/* Secondary actions — wrap onto their own line on mobile; inline (pushed right) on desktop */}
          <div className="order-3 sm:order-2 basis-full sm:basis-auto sm:shrink-0 sm:ml-auto flex items-center justify-between sm:justify-normal gap-2 pt-1.5 mt-0.5 border-t border-[#E2E8F0] dark:border-[#263244] sm:pt-0 sm:mt-0 sm:border-t-0">
            <ContextualFeedbackPopover
              materialId={compendium.id}
              label="Reportar erro no texto"
              variant="pill"
            />

            {/* Desktop (sm+): três botões separados, lado a lado — layout original preservado */}
            <div className="hidden sm:flex items-center gap-2">
              {/* Índice lateral toggle */}
              <button
                onClick={() => setIsIndexOpen((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  isIndexOpen
                    ? 'bg-teal-50 dark:bg-teal-950/40 text-[#0F766E] dark:text-[#14B8A6] border-teal-200 dark:border-teal-800'
                    : 'bg-white dark:bg-[#111827] border-[#E2E8F0] dark:border-[#263244] text-[#64748B] dark:text-[#94A3B8] hover:bg-slate-50 dark:hover:bg-[#182235]'
                }`}
                title="Índice de seções"
                aria-label="Índice de seções"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Índice</span>
              </button>

              {/* Anotações */}
              <button
                onClick={() => setShowNoteDrawer((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  showNoteDrawer
                    ? 'bg-teal-50 dark:bg-teal-950/40 text-[#0F766E] dark:text-[#14B8A6] border-teal-200 dark:border-teal-800'
                    : 'bg-white dark:bg-[#111827] border-[#E2E8F0] dark:border-[#263244] text-[#64748B] dark:text-[#94A3B8] hover:bg-slate-50 dark:hover:bg-[#182235]'
                }`}
                title="Anotações pessoais"
                aria-label="Anotações pessoais"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Anotações</span>
              </button>

              {/* Favoritar */}
              <button
                onClick={handleToggleBookmark}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  isBookmarked
                    ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700 text-[#0F766E] dark:text-[#14B8A6]'
                    : 'bg-white dark:bg-[#111827] border-[#E2E8F0] dark:border-[#263244] text-[#64748B] dark:text-[#94A3B8] hover:bg-slate-50 dark:hover:bg-[#182235]'
                }`}
                title={isBookmarked ? 'Favoritado' : 'Favoritar'}
                aria-label={isBookmarked ? 'Favoritado' : 'Favoritar'}
              >
                <Bookmark
                  className={`w-3.5 h-3.5 ${
                    isBookmarked ? 'fill-[#0F766E] dark:fill-[#14B8A6]' : ''
                  }`}
                />
              </button>
            </div>

            {/* Mobile (abaixo de sm): Índice, Anotações e Favoritar agrupados num menu
                único "Mais ações", com alvo de toque de 44×44 no gatilho e em cada item —
                evita 3 botões espremidos lado a lado numa faixa muito estreita. */}
            <div className="relative sm:hidden">
              <button
                ref={moreMenuTriggerRef}
                type="button"
                onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={isMoreMenuOpen}
                aria-controls="compendium-more-actions-menu"
                aria-label="Mais ações"
                title="Mais ações"
                className={`w-11 h-11 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                  isMoreMenuOpen
                    ? 'bg-teal-50 dark:bg-teal-950/40 text-[#0F766E] dark:text-[#14B8A6] border-teal-200 dark:border-teal-800'
                    : 'bg-white dark:bg-[#111827] border-[#E2E8F0] dark:border-[#263244] text-[#64748B] dark:text-[#94A3B8] hover:bg-slate-50 dark:hover:bg-[#182235]'
                }`}
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>

              {isMoreMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsMoreMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div
                    id="compendium-more-actions-menu"
                    role="menu"
                    aria-label="Mais ações"
                    className="absolute right-0 mt-2 z-50 w-60 rounded-xl border border-[#E2E8F0] dark:border-[#263244] bg-white dark:bg-[#111827] elev-lg py-1.5 animate-in fade-in"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsIndexOpen((prev) => !prev);
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full min-h-11 px-4 flex items-center gap-2.5 text-sm text-[#172033] dark:text-[#E5E7EB] hover:bg-slate-50 dark:hover:bg-[#182235] cursor-pointer"
                    >
                      <List
                        className={`w-4 h-4 shrink-0 ${
                          isIndexOpen ? 'text-[#0F766E] dark:text-[#14B8A6]' : 'text-[#64748B] dark:text-[#94A3B8]'
                        }`}
                      />
                      <span>Índice de seções</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowNoteDrawer((prev) => !prev);
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full min-h-11 px-4 flex items-center gap-2.5 text-sm text-[#172033] dark:text-[#E5E7EB] hover:bg-slate-50 dark:hover:bg-[#182235] cursor-pointer"
                    >
                      <MessageSquare
                        className={`w-4 h-4 shrink-0 ${
                          showNoteDrawer ? 'text-[#0F766E] dark:text-[#14B8A6]' : 'text-[#64748B] dark:text-[#94A3B8]'
                        }`}
                      />
                      <span>Anotações pessoais</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        handleToggleBookmark();
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full min-h-11 px-4 flex items-center gap-2.5 text-sm text-[#172033] dark:text-[#E5E7EB] hover:bg-slate-50 dark:hover:bg-[#182235] cursor-pointer"
                    >
                      <Bookmark
                        className={`w-4 h-4 shrink-0 ${
                          isBookmarked
                            ? 'fill-[#0F766E] dark:fill-[#14B8A6] text-[#0F766E] dark:text-[#14B8A6]'
                            : 'text-[#64748B] dark:text-[#94A3B8]'
                        }`}
                      />
                      <span>{isBookmarked ? 'Favoritado' : 'Favoritar'}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Drawer / Lateral Index (Mobile: Drawer | Desktop: Overlay or Slide) ── */}
      {isIndexOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setIsIndexOpen(false)}
            aria-hidden="true"
          />
          <aside className="fixed top-0 left-0 z-50 w-72 sm:w-80 h-full bg-white dark:bg-[#111827] border-r border-[#E2E8F0] dark:border-[#263244] elev-xl p-5 flex flex-col justify-between animate-in slide-in-from-left duration-200">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] dark:border-[#263244]">
                <div className="flex items-center gap-2">
                  <List className="w-4 h-4 text-[#0F766E] dark:text-[#14B8A6]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#172033] dark:text-[#E5E7EB]">
                    Índice do Artigo
                  </span>
                </div>
                <button
                  onClick={() => setIsIndexOpen(false)}
                  className="p-1 rounded-lg text-[#64748B] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#182235] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Progress info */}
              <div className="py-3 text-xs text-[#64748B] dark:text-[#94A3B8] flex items-center justify-between">
                <span>Progresso de leitura</span>
                <span className="font-semibold text-[#172033] dark:text-[#E5E7EB]">
                  {readSectionIds.length}/{compendium.sections.length} seções
                </span>
              </div>

              {/* List of sections */}
              <nav className="space-y-1 mt-2 max-h-[calc(100vh-160px)] overflow-y-auto pr-1">
                {compendium.sections.map((sec, idx) => {
                  const isRead = readSectionIds.includes(sec.id);
                  const isCurrent = activeSectionId === sec.id;

                  return (
                    <button
                      key={sec.id}
                      onClick={() => scrollToSection(sec.id)}
                      className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors flex items-start gap-2.5 cursor-pointer ${
                        isCurrent
                          ? 'bg-teal-50 dark:bg-teal-950/40 text-[#0F766E] dark:text-[#14B8A6] font-semibold'
                          : 'text-[#64748B] dark:text-[#94A3B8] hover:bg-slate-50 dark:hover:bg-[#182235] hover:text-[#172033] dark:hover:text-[#E5E7EB]'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 mt-0.5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                          isRead
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-slate-100 dark:bg-[#182235] text-[#64748B] dark:text-[#94A3B8]'
                        }`}
                      >
                        {isRead ? '✓' : idx + 1}
                      </span>
                      <span className="line-clamp-2 leading-relaxed">{sec.title}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>
        </>
      )}

      {/* ── Central Editorial Article (max-width between 760 and 820px) ───── */}
      {/* onClick aqui é só delegação de eventos para os links `a[href^="#ref-"]`
          do texto (ver handleContentClick). Links já são focáveis e Enter num
          link dispara `click`, que sobe até aqui — o teclado já funciona; o
          <main> em si não é um controle e não deve ganhar role/tabIndex. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <main className="max-w-[780px] w-full mx-auto px-4 sm:px-8 py-8 sm:py-12" onClick={handleContentClick}>
        {/* Anotações Pessoais Panel */}
        {showNoteDrawer && (
          <div className="mb-8 p-4 sm:p-5 rounded-xl border border-[#E2E8F0] dark:border-[#263244] bg-white dark:bg-[#111827] elev-xs">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#172033] dark:text-[#E5E7EB]">
                <MessageSquare className="w-4 h-4 text-[#0F766E] dark:text-[#14B8A6]" />
                <span>Anotações Pessoais</span>
              </div>
              <button
                onClick={() => setShowNoteDrawer(false)}
                className="text-xs text-[#64748B] dark:text-[#94A3B8] hover:underline cursor-pointer"
              >
                Fechar
              </button>
            </div>
            <textarea
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              placeholder="Escreva suas correlações clínicas, associações fisiopatológicas ou observações..."
              rows={4}
              className="w-full text-sm p-3 rounded-lg border border-[#E2E8F0] dark:border-[#263244] bg-[#F6F7F9] dark:bg-[#182235] text-[#172033] dark:text-[#E5E7EB] placeholder:text-[#94A3B8] focus:outline-hidden focus:ring-1 focus:ring-teal-500"
            />
            <div className="mt-2.5 flex justify-end">
              <button
                onClick={handleSaveNote}
                className="px-3 py-1.5 bg-[#0F766E] hover:bg-teal-800 dark:bg-[#14B8A6] dark:hover:bg-teal-400 text-white dark:text-[#0B1220] rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Salvar anotação
              </button>
            </div>
          </div>
        )}

        {/* ── Article Header (Without outer card) ───────────────────── */}
        <header className="mb-10 pb-8 border-b border-[#E2E8F0] dark:border-[#263244]">
          {/* Breadcrumb & Category */}
          <div className="text-xs font-semibold uppercase tracking-wider text-[#0F766E] dark:text-[#14B8A6] mb-2">
            {discipline?.name || 'Medicina'} · {theme?.name}
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#172033] dark:text-[#E5E7EB] leading-[1.2]">
            {compendium.title}
          </h1>

          {/* Subtitle */}
          {compendium.subtitle && (
            <p className="text-base sm:text-lg text-[#64748B] dark:text-[#94A3B8] font-normal leading-relaxed mt-3">
              {compendium.subtitle}
            </p>
          )}

          {/* Typographic Metadata Row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#64748B] dark:text-[#94A3B8] mt-4 pt-3">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>{compendium.estimatedReadTimeMinutes || 10} min de leitura</span>
            </span>
            <span>•</span>
            <span>{authorDisplay}</span>
            <span>•</span>
            <span>Atualizado: {lastUpdatedDisplay}</span>
          </div>

          {/* Tags */}
          {compendium.tags && compendium.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {compendium.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-[#182235] text-[#64748B] dark:text-[#94A3B8] border border-[#E2E8F0] dark:border-[#263244]"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* ── Article Sections (Clean spacing, no big wrapper cards) ── */}
        <div className="space-y-12">
          {compendium.sections.map((sec, idx) => {
            const isRead = readSectionIds.includes(sec.id);

            return (
              <section
                key={sec.id}
                id={sec.id}
                className="pb-10 border-b border-[#E2E8F0] dark:border-[#263244] last:border-b-0"
              >
                {/* Section Sub-header */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#0F766E] dark:text-[#14B8A6]">
                    {sec.mechanismTag || `Seção ${idx + 1}`}
                  </span>

                  {/* Inline actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCreateFlashcardFromSection(sec)}
                      className="px-2 py-1 rounded-md text-xs font-medium text-[#64748B] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#182235] flex items-center gap-1 cursor-pointer transition-colors"
                      title="Gerar flashcard com os pontos desta seção"
                    >
                      <Layers className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#14B8A6]" />
                      <span className="hidden sm:inline">Gerar flashcard</span>
                    </button>

                    <button
                      onClick={() => handleToggleRead(sec.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isRead
                          ? 'bg-teal-50 dark:bg-teal-950/40 text-[#0F766E] dark:text-[#14B8A6]'
                          : 'text-[#64748B] dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#182235]'
                      }`}
                    >
                      <CheckCircle2
                        className={`w-3.5 h-3.5 ${
                          isRead ? 'text-teal-600 dark:text-teal-400' : 'text-[#94A3B8]'
                        }`}
                      />
                      <span>{isRead ? 'Lida' : 'Marcar lida'}</span>
                    </button>
                  </div>
                </div>

                {/* Section Title */}
                <h2 className="text-xl sm:text-2xl font-bold text-[#172033] dark:text-[#E5E7EB] mb-4">
                  {sec.title}
                </h2>

                {/* Section Content with Safe Markdown (no dangerouslySetInnerHTML) */}
                <div className="text-[17px] leading-[1.7] text-[#172033] dark:text-[#E5E7EB]">
                  <SafeMarkdown content={sec.content} />
                </div>

                {/* Key Takeaways Callout (Teal border only) */}
                {sec.keyTakeaways && sec.keyTakeaways.length > 0 && (
                  <div className="mt-6 p-4 rounded-r-lg border-l-4 border-[#0F766E] dark:border-[#14B8A6] bg-teal-500/5 dark:bg-teal-500/10">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#0F766E] dark:text-[#14B8A6] mb-2">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Pontos-chave & Mecanismos</span>
                    </div>
                    <ul className="space-y-1.5 text-sm text-[#172033] dark:text-[#E5E7EB]">
                      {sec.keyTakeaways.map((takeaway, tIdx) => (
                        <li key={tIdx} className="flex items-start gap-2">
                          <span className="text-[#0F766E] dark:text-[#14B8A6] mt-0.5 shrink-0">•</span>
                          <span>{takeaway}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Clinical Pearl Callout (Amber border only) */}
                {sec.clinicalPearl && (
                  <div className="mt-4 p-4 rounded-r-lg border-l-4 border-[#F59E0B] bg-amber-500/5 dark:bg-amber-500/10 flex items-start gap-3">
                    <Lightbulb className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#F59E0B] block mb-0.5">
                        Pérola clínica & Aplicação
                      </span>
                      <p className="text-sm text-[#172033] dark:text-[#E5E7EB] leading-relaxed">
                        {sec.clinicalPearl}
                      </p>
                    </div>
                  </div>
                )}

                {/* Warning Alert (Red border only) */}
                {sec.warningAlert && (
                  <div className="mt-4 p-4 rounded-r-lg border-l-4 border-rose-500 bg-rose-500/5 dark:bg-rose-500/10 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 block mb-0.5">
                        Atenção redobrada
                      </span>
                      <p className="text-sm text-[#172033] dark:text-[#E5E7EB] leading-relaxed">
                        {sec.warningAlert}
                      </p>
                    </div>
                  </div>
                )}

                {/* Consenso de Prova vs. Prática Clínica (Indigo border) */}
                {sec.examConsensus && (
                  <div className="mt-4 p-4 rounded-r-lg border-l-4 border-indigo-600 bg-indigo-500/5 dark:bg-indigo-500/10 flex items-start gap-3">
                    <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block mb-0.5">
                        Consenso de Prova vs. Prática de Plantão
                      </span>
                      <p className="text-sm text-[#172033] dark:text-[#E5E7EB] leading-relaxed">
                        {sec.examConsensus}
                      </p>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* ── Discreet Action Bar for "Fixação & Retenção Ativa" ───── */}
        <div className="my-10 p-4 sm:p-5 rounded-xl border border-[#E2E8F0] dark:border-[#263244] bg-white dark:bg-[#111827] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#172033] dark:text-[#E5E7EB]">
              Fixação e Retenção Ativa
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
              Consolide os conceitos deste material resolvendo questões e revisando flashcards.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onOpenFlashcardsForTheme(compendium.themeId)}
              className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#263244] hover:bg-slate-50 dark:hover:bg-[#182235] text-[#172033] dark:text-[#E5E7EB] text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-[#0F766E] dark:text-[#14B8A6]" />
              <span>Flashcards</span>
            </button>

            {onReturnToQuestions && returnToQuestionsContext ? (
              <button
                onClick={onReturnToQuestions}
                className="px-3.5 py-1.5 rounded-lg bg-[#0F766E] hover:bg-teal-800 dark:bg-[#14B8A6] dark:hover:bg-teal-400 text-white dark:text-[#0B1220] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{returnToQuestionsContext.label || 'Retornar às Questões'}</span>
              </button>
            ) : (
              <button
                onClick={() => onOpenQuestionsForTheme(compendium.themeId)}
                className="px-3 py-1.5 rounded-lg bg-[#0F766E] hover:bg-teal-800 dark:bg-[#14B8A6] dark:hover:bg-teal-400 text-white dark:text-[#0B1220] text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Resolver questões</span>
              </button>
            )}
          </div>
        </div>

        {/* ── References ───────────────────────────────────────────── */}
        {compendium.references && compendium.references.length > 0 && (
          <footer className="pt-8 border-t border-[#E2E8F0] dark:border-[#263244] mt-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-4 h-4 text-[#0F766E] dark:text-[#14B8A6]" />
                  <h4 className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    Referências Bibliográficas & Diretrizes Oficiais
                  </h4>
                </div>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  Cada referência mostra a origem real da informação: link curado, DOI, PubMed, ou — quando nenhum identificador foi confirmado — uma sugestão de busca, claramente identificada como tal.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {compendium.references.map((ref, rIdx) => {
                const linkInfo = compendium.referenceSources?.[rIdx];
                const abnt = formatToAbntCitation(ref, linkInfo?.url);

                return (
                  <div
                    key={rIdx}
                    id={`ref-${rIdx + 1}`}
                    className={`p-4 rounded-2xl border bg-[#F8FAFC] dark:bg-[#1E293B]/60 transition-all shadow-xs space-y-3 scroll-mt-24 ${
                      highlightedRefId === `ref-${rIdx + 1}`
                        ? 'border-[#0F766E] dark:border-[#14B8A6] ring-2 ring-[#0F766E] dark:ring-[#14B8A6]'
                        : 'border-[#E2E8F0] dark:border-[#263244]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span className="font-mono text-xs font-bold text-[#0F766E] dark:text-[#14B8A6] bg-[#0F766E]/10 dark:bg-[#14B8A6]/15 px-2 py-0.5 rounded shrink-0 mt-0.5">
                          [{rIdx + 1}]
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-xs text-[#1E293B] dark:text-[#E2E8F0] font-bold uppercase tracking-wider leading-snug">
                            {abnt.author}
                          </p>
                          <p className="text-xs font-semibold text-[#0F766E] dark:text-[#14B8A6] leading-relaxed">
                            {abnt.title}.
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-mono">
                            {abnt.publicationDetails}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-start shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleCopyAbnt(e, abnt.fullAbntText, rIdx)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Copiar referência formatada em ABNT NBR 6023"
                        >
                          {copiedRefIdx === rIdx ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>Copiar ABNT</span>
                            </>
                          )}
                        </button>

                        <a
                          href={abnt.accessUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-[#0F766E] hover:bg-teal-800 dark:bg-[#14B8A6] dark:hover:bg-teal-400 text-white dark:text-[#0B1220] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                          title={abnt.actionLabel}
                        >
                          <span>{abnt.actionLabel}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/50 px-2 py-0.5 rounded border border-teal-200/80 dark:border-teal-800/50">
                        <BookOpen className="w-2.5 h-2.5" />
                        ABNT NBR 6023
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          abnt.isOpenAccess
                            ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60'
                            : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60'
                        }`}
                      >
                        {abnt.badgeLabel}
                      </span>
                      <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                        {abnt.documentType}
                      </span>
                      {linkInfo?.verificacao && (
                        <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          {sourceVerificationLabel(linkInfo.verificacao)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </footer>
        )}

        {/* ── Callout de Revisão & Feedback Editorial ────── */}
        <div className="my-6 p-4 rounded-2xl bg-slate-50 dark:bg-[#142038]/70 border border-slate-200 dark:border-[#243452] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-200 dark:border-rose-900/60 shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold block">Notou alguma divergência de diretriz, erro conceitual ou ortográfico?</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Nosso comitê médico revisa cada apontamento para manter o texto 100% fidedigno.</span>
            </div>
          </div>
          <div className="self-end sm:self-auto shrink-0">
            <ContextualFeedbackPopover
              materialId={compendium.id}
              label="Reportar Erro no Texto"
              variant="pill"
            />
          </div>
        </div>

        {/* ── Fixação do Conteúdo / Próximos Passos Interativos ────── */}
        <section
          aria-label="Fixação do Conteúdo"
          className="my-10 p-6 rounded-3xl bg-gradient-to-br from-teal-500/10 via-slate-50 to-indigo-500/5 dark:from-teal-950/40 dark:via-[#111827] dark:to-indigo-950/20 border border-teal-500/30 dark:border-teal-700/40 elev-md space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-600 dark:bg-teal-500 text-white dark:text-slate-950 flex items-center justify-center shrink-0 elev-xs shadow-teal-600/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                Fixação & Aplicação Clínica
              </span>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Pronto para testar seus conhecimentos?
              </h3>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Consolide o que você acabou de ler resolvendo questões de prova com comentários detalhados sobre {theme?.name || compendium.title} ou revisando os flashcards de repetição espaçada.
          </p>
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => onOpenQuestionsForTheme(compendium.themeId)}
              className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer elev-xs hover:scale-[1.02]"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Resolver Questões deste Tema</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenFlashcardsForTheme(compendium.themeId)}
              className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
            >
              <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>Revisar Flashcards</span>
            </button>
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2.5 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer ml-auto"
            >
              Voltar à Biblioteca
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};
