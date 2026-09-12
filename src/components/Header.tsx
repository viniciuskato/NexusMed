import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Flame,
  Sun,
  Moon,
  LogOut,
  User as UserIcon,
  ChevronDown,
  MessageSquarePlus,
  Settings,
  Compass,
  FolderArchive,
  BookOpen,
  HelpCircle,
  Layers,
} from 'lucide-react';
import { UserPlan, UserStats, ThemeMode } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { SyncStatusIndicator } from './common/SyncStatusIndicator';
import { Logo } from './common/Logo';

interface HeaderProps {
  currentPlan: UserPlan;
  onOpenPlanModal?: () => void;
  onTogglePlanQuick?: () => void;
  onOpenSearch: () => void;
  stats: UserStats;
  dueCardsCount: number;
  errorLogCount?: number;
  activeView: string;
  onSelectView: (view: string) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenFeedback?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSearch,
  stats,
  dueCardsCount = 0,
  errorLogCount = 0,
  activeView,
  onSelectView,
  theme,
  onToggleTheme,
  onOpenFeedback,
}) => {
  const { user, profile, logout } = useAuth();
  const [isResourcesDropdownOpen, setIsResourcesDropdownOpen] = useState(false);
  const resourcesDropdownRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--app-header-height', `${header.getBoundingClientRect().height}px`);
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // Fechar o menu de usuário com a tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setUserDropdownOpen(false);
        setIsResourcesDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fechar dropdown de recursos ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        resourcesDropdownRef.current &&
        !resourcesDropdownRef.current.contains(e.target as Node)
      ) {
        setIsResourcesDropdownOpen(false);
      }
    };
    if (isResourcesDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isResourcesDropdownOpen]);

  const displayName = profile?.displayName || user?.user_metadata?.display_name || 'Estudante';
  const photoURL = profile?.photoURL || user?.user_metadata?.avatar_url || null;
  const isAdmin = profile?.role === 'admin';

  // Iniciais para fallback do avatar
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const isResourceActive =
    activeView === 'compendiums' ||
    activeView === 'compendium-reader' ||
    activeView === 'questions' ||
    activeView === 'simulados' ||
    activeView === 'simulado-session' ||
    activeView === 'flashcards' ||
    activeView === 'flashcard-session';

  return (
    <header ref={headerRef} className="sticky top-0 z-30 bg-white/80 dark:bg-[#0B1220]/80 backdrop-blur-xl border-b border-slate-200/70 dark:border-white/10 px-3 sm:px-6 lg:px-8 py-2.5 transition-colors max-w-full">
      <div className="max-w-[1720px] mx-auto flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Left: Brand Identity + Desktop Navigation */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0 min-w-0">
          <button
            onClick={() => onSelectView('dashboard')}
            className="min-h-11 flex items-center gap-1.5 sm:gap-2.5 text-left group focus:outline-hidden cursor-pointer min-w-0"
          >
            <Logo className="w-8 h-8 rounded-xl elev-sm shadow-teal-600/30 group-hover:scale-105 transition-transform shrink-0" />
            <div className="min-w-0">
              <span className="font-serif font-bold text-sm sm:text-lg tracking-tight bg-gradient-to-r from-slate-900 to-teal-800 dark:from-white dark:to-teal-300 bg-clip-text text-transparent truncate block">
                NexusMed
              </span>
            </div>
          </button>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 pl-2 border-l border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onSelectView('dashboard')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeView === 'dashboard'
                  ? 'bg-teal-50 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#142038]'
              }`}
            >
              Início
            </button>

            <button
              type="button"
              onClick={() => onSelectView('thematic-study')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeView === 'thematic-study'
                  ? 'bg-teal-50 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#142038]'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>Estudo Temático</span>
            </button>

            {/* Dropdown Recursos */}
            <div className="relative" ref={resourcesDropdownRef}>
              <button
                type="button"
                onClick={() => setIsResourcesDropdownOpen((prev) => !prev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isResourceActive || isResourcesDropdownOpen
                    ? 'bg-teal-50 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 font-bold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#142038]'
                }`}
              >
                <FolderArchive className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>Recursos</span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${
                    isResourcesDropdownOpen ? 'rotate-180 text-teal-600 dark:text-teal-400' : 'text-slate-400'
                  }`}
                />
              </button>

              {isResourcesDropdownOpen && (
                <div className="absolute left-0 mt-2 w-64 p-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 mb-1">
                    Acesso Específico
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsResourcesDropdownOpen(false);
                      onSelectView('compendiums');
                    }}
                    className={`w-full p-2 rounded-xl text-left flex items-center gap-2.5 transition-colors cursor-pointer text-xs ${
                      activeView === 'compendiums' || activeView === 'compendium-reader'
                        ? 'bg-teal-50 dark:bg-teal-950 text-teal-900 dark:text-teal-200 font-bold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                    }`}
                  >
                    <BookOpen className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                    <div>
                      <div className="font-bold">Biblioteca</div>
                      <div className="text-[10px] text-slate-400 font-normal">Compêndios e leitura</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsResourcesDropdownOpen(false);
                      onSelectView('questions');
                    }}
                    className={`w-full p-2 rounded-xl text-left flex items-center gap-2.5 transition-colors cursor-pointer text-xs ${
                      activeView === 'questions' || activeView === 'simulados' || activeView === 'simulado-session'
                        ? 'bg-teal-50 dark:bg-teal-950 text-teal-900 dark:text-teal-200 font-bold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                    }`}
                  >
                    <HelpCircle className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                    <div>
                      <div className="font-bold">Questões</div>
                      <div className="text-[10px] text-slate-400 font-normal">Packs por material</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsResourcesDropdownOpen(false);
                      onSelectView('flashcards');
                    }}
                    className={`w-full p-2 rounded-xl text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer text-xs ${
                      activeView === 'flashcards' || activeView === 'flashcard-session'
                        ? 'bg-teal-50 dark:bg-teal-950 text-teal-900 dark:text-teal-200 font-bold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                      <div>
                        <div className="font-bold">Cards</div>
                        <div className="text-[10px] text-slate-400 font-normal">Packs e revisão SRS</div>
                      </div>
                    </div>
                    {dueCardsCount > 0 && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-amber-500 text-slate-950">
                        {dueCardsCount}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>
          </nav>
        </div>


        {/* Right: Quick Search, Streak, Theme Toggle, Profile */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Quick Search Button (Desktop) */}
          <button
            onClick={onOpenSearch}
            style={{ minWidth: 44, minHeight: 44 }}
            className="hidden sm:flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-100/90 dark:bg-[#142038] hover:bg-slate-200/70 dark:hover:bg-[#1A2845] border border-slate-200/80 dark:border-[#243452] text-xs text-slate-500 dark:text-slate-400 transition-all cursor-pointer shadow-2xs group"
            title="Buscar compêndios, questões ou temas (Ctrl + K)"
          >
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors" />
            <span className="hidden xl:inline text-slate-600 dark:text-slate-300 font-medium">
              Buscar
            </span>
            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#243452] rounded-md">
              Ctrl K
            </kbd>
          </button>

          {/* Mobile search icon button */}
          <button
            onClick={onOpenSearch}
            style={{ minWidth: 44, minHeight: 44 }}
            className="p-2 sm:hidden text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#142038] rounded-xl cursor-pointer"
            title="Buscar"
          >
            <Search className="w-4 h-4" />
          </button>

          <SyncStatusIndicator />

          {/* Gamified Streak Flame Badge */}
          <div
            className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold shadow-2xs shrink-0"
            title={`${stats.streakDays} dias seguidos de estudo`}
          >
            <Flame className="w-4 h-4 fill-amber-500 text-amber-500 animate-flame shrink-0" />
            <span className="tabular-nums">{stats.streakDays}d</span>
          </div>

          {/* Direct Feedback / Report Error Button */}
          {onOpenFeedback && (
            <button
              onClick={onOpenFeedback}
              id="header-feedback-btn"
              style={{ minHeight: 44 }}
              className="px-2 sm:px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#243452] bg-white dark:bg-[#0F172A] hover:bg-slate-100 dark:hover:bg-[#142038] text-slate-600 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs shrink-0"
              title="Enviar feedback ou reportar erro"
              aria-label="Enviar feedback ou reportar erro"
            >
              <MessageSquarePlus className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="hidden xl:inline text-xs font-semibold">Feedback</span>
            </button>
          )}

          {/* Theme Selector (Claro / Escuro) */}
          <button
            onClick={onToggleTheme}
            id="header-theme-toggle"
            style={{ minWidth: 44, minHeight: 44 }}
            className="p-2 rounded-xl border border-slate-200 dark:border-[#243452] bg-white dark:bg-[#0F172A] hover:bg-slate-100 dark:hover:bg-[#142038] text-slate-600 dark:text-slate-400 transition-colors cursor-pointer flex items-center justify-center shadow-2xs shrink-0"
            title={theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
            aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
          </button>

          {/* Perfil do Usuário Autenticado */}
          <div className="relative">
            <button
              id="btn-user-profile-menu"
              type="button"
              onClick={() => setUserDropdownOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={userDropdownOpen}
              aria-controls="user-profile-dropdown"
              aria-label="Menu do perfil de usuário"
              style={{ minWidth: 44, minHeight: 44 }}
              className="flex items-center gap-1 sm:gap-2 p-1.5 sm:px-2 sm:py-1 rounded-lg border border-[#E2E8F0] dark:border-[#263244] hover:bg-slate-50 dark:hover:bg-[#182235] transition-colors cursor-pointer bg-white dark:bg-[#111827] focus:outline-hidden shrink-0"
              title="Menu do Usuário"
            >
              {photoURL ? (
                <img
                  src={photoURL}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover border border-[#E2E8F0] dark:border-[#263244]"
                />
              ) : (
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-teal-700 dark:bg-teal-600 text-white flex items-center justify-center text-xs font-bold">
                  {initials || <UserIcon className="w-3.5 h-3.5" />}
                </div>
              )}
              <span className="hidden md:inline text-xs font-medium text-[#172033] dark:text-[#E5E7EB] max-w-[100px] truncate">
                {displayName}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#64748B] dark:text-[#94A3B8] transition-transform ${
                  userDropdownOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {/* Dropdown Menu com Perfil, Beta Privada e Botão Sair */}
            {userDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setUserDropdownOpen(false)}
                  aria-hidden="true"
                />
                <div
                  id="user-profile-dropdown"
                  role="menu"
                  aria-orientation="vertical"
                  aria-labelledby="btn-user-profile-menu"
                  className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263244] elev-lg py-2 z-50 transition-colors"
                >
                  <div className="px-4 py-2 border-b border-[#E2E8F0] dark:border-[#263244]">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-[#172033] dark:text-[#E5E7EB] truncate">
                        {displayName}
                      </p>
                      <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#182235] text-[#64748B] dark:text-[#94A3B8] border border-[#E2E8F0] dark:border-[#263244]">
                        Beta privada
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate mt-0.5">
                      {user?.email || profile?.email || 'Conta vinculada'}
                    </p>
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onSelectView('admin');
                        setUserDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-[#172033] dark:text-[#E5E7EB] hover:bg-slate-100 dark:hover:bg-[#182235] flex items-center gap-2 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-[#64748B] dark:text-[#94A3B8]" />
                      <span>Área Editorial / CMS</span>
                    </button>
                  )}

                  {onOpenFeedback && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        onOpenFeedback();
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-[#172033] dark:text-[#E5E7EB] hover:bg-slate-100 dark:hover:bg-[#182235] flex items-center gap-2 cursor-pointer"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                      <span>Enviar feedback</span>
                    </button>
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    id="btn-logout"
                    onClick={async () => {
                      setUserDropdownOpen(false);
                      await logout();
                    }}
                    className="w-full text-left px-4 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 cursor-pointer border-t border-[#E2E8F0] dark:border-[#263244] mt-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
