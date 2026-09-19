import React, { useState } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  HelpCircle,
  Layers,
  BookMarked,
  Database,
  Compass,
  X,
  ArrowRight,
  Sparkles,
  Sun,
  Moon,
  Search,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LastReadingSession, ThemeMode } from '../../types';
import { useDialogA11y } from '../../hooks/useDialogA11y';

interface FloatingNavHubProps {
  activeView: string;
  onSelectView: (view: string) => void;
  dueCardsCount?: number;
  errorLogCount?: number;
  lastReadingSession?: LastReadingSession | null;
  onResumeReading?: () => void;
  onOpenSearch?: () => void;
  theme?: ThemeMode;
  onToggleTheme?: () => void;
}

export const FloatingNavHub: React.FC<FloatingNavHubProps> = ({
  activeView,
  onSelectView,
  dueCardsCount = 0,
  errorLogCount = 0,
  lastReadingSession,
  onResumeReading,
  onOpenSearch,
  theme,
  onToggleTheme,
}) => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [isOpen, setIsOpen] = useState(false);

  // Escape fecha o menu, Tab fica preso nele e o foco volta ao botão que o
  // abriu (antes: só um listener de Escape em window).
  const menuDialogRef = useDialogA11y<HTMLDivElement>({ isOpen, onClose: () => setIsOpen(false) });

  const navItems = [
    {
      id: 'dashboard',
      label: 'Início',
      description: 'Métricas, metas e visão geral',
      icon: LayoutDashboard,
      badge: null,
      color: 'text-sky-600 dark:text-sky-400',
    },
    {
      id: 'compendiums',
      label: 'Biblioteca',
      description: 'Compêndios, fisiopatologia e guias',
      icon: BookOpen,
      badge: null,
      color: 'text-teal-600 dark:text-teal-400',
    },
    {
      id: 'questions',
      label: 'Questões',
      description: 'Banco de questões comentadas',
      icon: HelpCircle,
      badge: null,
      color: 'text-indigo-600 dark:text-indigo-400',
    },
    {
      id: 'flashcards',
      label: 'Flashcards',
      description: 'Revisão espaçada (SRS)',
      icon: Layers,
      badge: dueCardsCount > 0 ? dueCardsCount : null,
      badgeColor: 'bg-teal-600 text-white',
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      id: 'errors',
      label: 'Caderno de Erros',
      description: 'Análise detalhada de erros',
      icon: BookMarked,
      badge: errorLogCount > 0 ? errorLogCount : null,
      badgeColor: 'bg-rose-600 text-white',
      color: 'text-rose-600 dark:text-rose-400',
    },
    ...(isAdmin
      ? [
          {
            id: 'admin',
            label: 'Editorial',
            description: 'Gestão de conteúdo e CMS',
            icon: Database,
            badge: null,
            badgeColor: '',
            color: 'text-purple-600 dark:text-purple-400',
          },
        ]
      : []),
  ];

  const handleNavigate = (viewId: string) => {
    onSelectView(viewId);
    setIsOpen(false);
  };

  const handleResume = () => {
    if (onResumeReading) {
      onResumeReading();
      setIsOpen(false);
    }
  };

  const isReading = activeView === 'compendium-reader';

  return (
    <>
      {/* ── Overlay when floating menu is open ──────────────────────── */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
          aria-hidden="true"
        />
      )}

      {/* ── Floating Expanded Command Menu ─────────────────────────── */}
      {isOpen && (
        <div
          ref={menuDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="floating-nav-hub-title"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-lg bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-2xl border border-slate-200/90 dark:border-[#243452] elev-2xl shadow-2xl rounded-3xl p-4 sm:p-5 transition-all animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <Compass className="w-4 h-4" />
              </div>
              <span id="floating-nav-hub-title" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Navegação Flutuante
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Fechar menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Featured Action: Return to active reading material */}
          {lastReadingSession && !isReading && (
            <div className="my-3 p-3 rounded-2xl bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-teal-500/5 dark:from-teal-950/50 dark:to-emerald-950/40 border border-teal-500/30 dark:border-teal-700/40 elev-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                    <Sparkles className="w-3 h-3" />
                    <span>Continuar Leitura em Andamento</span>
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                    {lastReadingSession.compendiumTitle}
                  </h4>
                  {lastReadingSession.sectionTitle && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      Última seção: {lastReadingSession.sectionTitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleResume}
                  className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer shadow-xs"
                >
                  <span>Retomar</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* If inside reading mode: offer quick jump to questions */}
          {isReading && lastReadingSession?.themeId && (
            <div className="my-3 p-3 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 elev-xs flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 block">
                  Treino Prático do Tema
                </span>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                  Testar conhecimentos sobre este compêndio
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleNavigate('questions')}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
              >
                <span>Questões</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Navigation Grid */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                    isActive
                      ? 'bg-teal-50/90 dark:bg-teal-950/50 border-teal-300 dark:border-teal-700 elev-xs'
                      : 'bg-slate-50/60 dark:bg-slate-900/60 border-slate-200/70 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isActive
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-xs font-bold truncate ${
                          isActive
                            ? 'text-teal-900 dark:text-teal-200'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {item.label}
                      </span>
                      {item.badge && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-rose-500 text-white">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">
                      {item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bottom quick utilities */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            {onOpenSearch && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenSearch();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Buscar (Ctrl+K)</span>
              </button>
            )}

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer ml-auto"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Modo Claro</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-slate-600" />
                    <span>Modo Escuro</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Persistent Floating Dock / Return Island ─────────────────── */}
      <div className="fixed bottom-3.5 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-lg flex flex-col items-center gap-2 pointer-events-none">
        {/* Floating Quick Return Pill (when not in reading and there is an active session) */}
        {!isOpen && lastReadingSession && !isReading && (
          <button
            type="button"
            onClick={handleResume}
            className="pointer-events-auto px-3.5 py-1.5 rounded-full bg-slate-900/90 dark:bg-[#142038]/95 backdrop-blur-md border border-teal-500/40 text-white text-[11px] font-semibold flex items-center gap-2 elev-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer group shadow-lg"
            title={`Retomar ${lastReadingSession.compendiumTitle}`}
          >
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-teal-300 font-bold uppercase tracking-wider text-[9px]">
              Retomar:
            </span>
            <span className="truncate max-w-[200px] sm:max-w-[280px]">
              {lastReadingSession.compendiumTitle}
            </span>
            <ArrowRight className="w-3 h-3 text-teal-400 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

        {/* Floating Interactive Dock */}
        <nav
          id="system-floating-dock"
          aria-label="Navegação Flutuante do Sistema"
          className="pointer-events-auto w-full bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-2xl border border-slate-200/90 dark:border-[#243452] elev-xl shadow-2xl rounded-2xl p-1.5 flex items-center justify-between gap-1 transition-all"
        >
          {/* Main fast tabs */}
          <button
            type="button"
            onClick={() => onSelectView('dashboard')}
            className={`flex-1 py-1.5 px-2 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
              activeView === 'dashboard'
                ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
            }`}
            title="Início"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Início</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectView('compendiums')}
            className={`flex-1 py-1.5 px-2 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
              activeView === 'compendiums' || activeView === 'compendium-reader'
                ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
            }`}
            title="Biblioteca Médica"
          >
            <BookOpen className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Biblioteca</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectView('questions')}
            className={`flex-1 py-1.5 px-2 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer relative ${
              activeView === 'questions' || activeView === 'simulados' || activeView === 'simulado-session'
                ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
            }`}
            title="Banco de Questões"
          >
            <HelpCircle className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Questões</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectView('flashcards')}
            className={`flex-1 py-1.5 px-2 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer relative ${
              activeView === 'flashcards' || activeView === 'flashcard-session'
                ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
            }`}
            title="Flashcards"
          >
            <Layers className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Cards</span>
            {dueCardsCount > 0 && (
              <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-teal-500" />
            )}
          </button>

          {/* Central Floating Action Button (The "Botão que a partir de agora será flutuante") */}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={`py-1.5 px-3 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer font-bold text-xs ${
              isOpen
                ? 'bg-teal-700 text-white shadow-md scale-95'
                : 'bg-teal-600 hover:bg-teal-700 text-white shadow-xs hover:scale-105'
            }`}
            title="Menu Flutuante e Central de Ações"
            aria-label="Menu Flutuante e Central de Ações"
          >
            <Compass className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Navegar</span>
          </button>
        </nav>
      </div>
    </>
  );
};
