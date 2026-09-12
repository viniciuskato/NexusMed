import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Compass,
  Layers,
  BookOpen,
  HelpCircle,
  Database,
  ArrowRight,
  ChevronUp,
  FolderArchive,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LastReadingSession } from '../../types';

interface MobileBottomNavProps {
  activeView: string;
  onSelectView: (view: string) => void;
  dueCardsCount?: number;
  errorLogCount?: number;
  lastReadingSession?: LastReadingSession | null;
  onResumeReading?: () => void;
  onOpenSearch?: () => void;
  onOpenCreateSimulado?: () => void;
  theme?: string;
  onToggleTheme?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  onSelectView,
  dueCardsCount = 0,
  lastReadingSession,
  onResumeReading,
}) => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [isResourcesMenuOpen, setIsResourcesMenuOpen] = useState(false);
  const resourcesMenuRef = useRef<HTMLDivElement>(null);

  // Fecha o menu de recursos ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        resourcesMenuRef.current &&
        !resourcesMenuRef.current.contains(e.target as Node)
      ) {
        setIsResourcesMenuOpen(false);
      }
    };
    if (isResourcesMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isResourcesMenuOpen]);

  // Checa se a view atual é um dos recursos isolados
  const isResourceActive =
    activeView === 'compendiums' ||
    activeView === 'compendium-reader' ||
    activeView === 'questions' ||
    activeView === 'simulados' ||
    activeView === 'simulado-session' ||
    activeView === 'flashcards' ||
    activeView === 'flashcard-session';

  const isReading = activeView === 'compendium-reader';
  const isSimuladoSession = activeView === 'simulado-session';

  const resourceItems = [
    {
      id: 'compendiums',
      label: 'Biblioteca',
      desc: 'Compêndios e leitura teórica',
      icon: BookOpen,
      isActive: activeView === 'compendiums' || activeView === 'compendium-reader',
      badge: null,
      badgeColor: '',
    },
    {
      id: 'questions',
      label: 'Questões',
      desc: 'Packs de questões por material',
      icon: HelpCircle,
      isActive:
        activeView === 'questions' ||
        activeView === 'simulados' ||
        activeView === 'simulado-session',
      badge: null,
      badgeColor: '',
    },
    {
      id: 'flashcards',
      label: 'Cards',
      desc: 'Packs de flashcards e revisão SRS',
      icon: Layers,
      isActive: activeView === 'flashcards' || activeView === 'flashcard-session',
      badge: dueCardsCount > 0 ? dueCardsCount : null,
      badgeColor: 'bg-amber-500 text-slate-950 font-extrabold',
    },
  ];

  return (
    <div
      ref={resourcesMenuRef}
      className="fixed bottom-4 sm:bottom-5 left-1/2 -translate-x-1/2 z-40 w-auto max-w-[94vw] flex flex-col items-center gap-2 pointer-events-none"
    >
      {/* Popover / Menu Flutuante de Recursos (Biblioteca, Questões, Cards) */}
      {isResourcesMenuOpen && (
        <div
          role="dialog"
          aria-label="Menu de Recursos Específicos"
          className="pointer-events-auto w-72 sm:w-80 p-2.5 rounded-3xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200/90 dark:border-slate-800 shadow-[0_16px_40px_rgba(0,0,0,0.25)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.6)] animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <div className="px-3 py-1.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
              Acesso Específico ao Acervo
            </span>
            <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">
              3 Módulos
            </span>
          </div>

          <div className="space-y-1">
            {resourceItems.map((res) => {
              const Icon = res.icon;
              return (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => {
                    setIsResourcesMenuOpen(false);
                    onSelectView(res.id);
                  }}
                  className={`w-full p-2.5 rounded-2xl flex items-center justify-between gap-3 text-left transition-all cursor-pointer ${
                    res.isActive
                      ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200 border border-teal-200/80 dark:border-teal-700/60'
                      : 'hover:bg-slate-100 dark:hover:bg-[#142038] text-slate-700 dark:text-slate-200 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        res.isActive
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-[#1A2845] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight truncate flex items-center gap-1.5">
                        <span>{res.label}</span>
                        {res.badge !== null && (
                          <span
                            className={`px-1.5 py-0.2 text-[9px] rounded-full ${res.badgeColor}`}
                          >
                            {res.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-400 truncate">
                        {res.desc}
                      </div>
                    </div>
                  </div>

                  <ArrowRight
                    className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                      res.isActive
                        ? 'text-teal-600 dark:text-teal-400 translate-x-0.5'
                        : 'text-slate-300 dark:text-slate-600'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pílula flutuante de retomada rápida quando fora do leitor */}
      {lastReadingSession && !isReading && !isSimuladoSession && (
        <button
          type="button"
          onClick={onResumeReading}
          className="pointer-events-auto px-4 py-1.5 rounded-full bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-2xl border border-teal-400/60 dark:border-teal-400/50 text-white text-[11px] font-semibold flex items-center gap-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:bg-slate-900 dark:hover:bg-slate-950 active:scale-[0.98] transition-all cursor-pointer group"
          title={`Retomar leitura: ${lastReadingSession.compendiumTitle}`}
        >
          <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse shrink-0" />
          <span className="text-teal-300 font-bold uppercase tracking-wider text-[9px] shrink-0">
            Retomar:
          </span>
          <span className="truncate max-w-[160px] sm:max-w-[240px]">
            {lastReadingSession.compendiumTitle}
          </span>
          <ArrowRight className="w-3 h-3 text-teal-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
        </button>
      )}

      {/* Dock Flutuante Transparente Unificado */}
      <nav
        id="mobile-floating-dock"
        aria-label="Navegação Principal"
        className="pointer-events-auto flex items-center justify-center gap-1 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-2xl bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl border border-slate-200/80 dark:border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] transition-all"
      >
        {/* 1. Início (dados do usuário) */}
        <button
          type="button"
          onClick={() => {
            setIsResourcesMenuOpen(false);
            onSelectView('dashboard');
          }}
          className={`relative flex flex-col items-center justify-center py-1.5 px-3 sm:px-4 rounded-xl transition-all cursor-pointer min-w-[56px] sm:min-w-[64px] ${
            activeView === 'dashboard'
              ? 'bg-teal-600/15 dark:bg-teal-400/20 text-teal-800 dark:text-teal-200 font-bold border border-teal-500/30 dark:border-teal-400/40 shadow-xs'
              : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-white/30 dark:hover:bg-white/10 border border-transparent font-medium'
          }`}
        >
          <LayoutDashboard
            className={`w-4 h-4 transition-transform ${
              activeView === 'dashboard' ? 'scale-110 text-teal-600 dark:text-teal-400' : ''
            }`}
          />
          <span className="text-[10px] sm:text-[11px] mt-0.5 tracking-tight truncate">
            Início
          </span>
        </button>

        {/* 2. Estudo Temático (Trilha integrada: leitura + questões + flashcards) */}
        <button
          type="button"
          onClick={() => {
            setIsResourcesMenuOpen(false);
            onSelectView('thematic-study');
          }}
          className={`relative flex flex-col items-center justify-center py-1.5 px-3 sm:px-4 rounded-xl transition-all cursor-pointer min-w-[56px] sm:min-w-[64px] ${
            activeView === 'thematic-study'
              ? 'bg-teal-600/15 dark:bg-teal-400/20 text-teal-800 dark:text-teal-200 font-bold border border-teal-500/30 dark:border-teal-400/40 shadow-xs'
              : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-white/30 dark:hover:bg-white/10 border border-transparent font-medium'
          }`}
        >
          <Compass
            className={`w-4 h-4 transition-transform ${
              activeView === 'thematic-study' ? 'scale-110 text-teal-600 dark:text-teal-400' : ''
            }`}
          />
          <span className="text-[10px] sm:text-[11px] mt-0.5 tracking-tight truncate">
            Estudo Temático
          </span>
        </button>

        {/* 3. Recursos (Botão agrupador de Biblioteca, Questões e Cards) */}
        <button
          type="button"
          onClick={() => setIsResourcesMenuOpen((prev) => !prev)}
          className={`relative flex flex-col items-center justify-center py-1.5 px-3 sm:px-4 rounded-xl transition-all cursor-pointer min-w-[56px] sm:min-w-[64px] ${
            isResourceActive || isResourcesMenuOpen
              ? 'bg-teal-600/15 dark:bg-teal-400/20 text-teal-800 dark:text-teal-200 font-bold border border-teal-500/30 dark:border-teal-400/40 shadow-xs'
              : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-white/30 dark:hover:bg-white/10 border border-transparent font-medium'
          }`}
        >
          <div className="relative flex items-center">
            <FolderArchive
              className={`w-4 h-4 transition-transform ${
                isResourceActive || isResourcesMenuOpen
                  ? 'scale-110 text-teal-600 dark:text-teal-400'
                  : ''
              }`}
            />
            <ChevronUp
              className={`w-2.5 h-2.5 ml-0.5 transition-transform ${
                isResourcesMenuOpen ? 'rotate-180 text-teal-600 dark:text-teal-400' : 'text-slate-400'
              }`}
            />
            {dueCardsCount > 0 && !isResourcesMenuOpen && (
              <span className="absolute -top-1.5 -right-3 px-1 text-[9px] font-bold rounded-full bg-amber-500 text-slate-950 min-w-[14px] h-[14px] flex items-center justify-center shadow-xs">
                {dueCardsCount > 99 ? '99+' : dueCardsCount}
              </span>
            )}
          </div>
          <span className="text-[10px] sm:text-[11px] mt-0.5 tracking-tight truncate">
            Recursos
          </span>
        </button>

        {/* 4. CMS (se for admin) */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setIsResourcesMenuOpen(false);
              onSelectView('admin');
            }}
            className={`relative flex flex-col items-center justify-center py-1.5 px-3 sm:px-4 rounded-xl transition-all cursor-pointer min-w-[56px] sm:min-w-[64px] ${
              activeView === 'admin'
                ? 'bg-teal-600/15 dark:bg-teal-400/20 text-teal-800 dark:text-teal-200 font-bold border border-teal-500/30 dark:border-teal-400/40 shadow-xs'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-white/30 dark:hover:bg-white/10 border border-transparent font-medium'
            }`}
          >
            <Database
              className={`w-4 h-4 transition-transform ${
                activeView === 'admin' ? 'scale-110 text-teal-600 dark:text-teal-400' : ''
              }`}
            />
            <span className="text-[10px] sm:text-[11px] mt-0.5 tracking-tight truncate">
              CMS
            </span>
          </button>
        )}
      </nav>
    </div>
  );
};
