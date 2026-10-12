import React from 'react';
import { LayoutDashboard, BookOpen, HelpCircle, Database, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LastReadingSession } from '../../types';

interface MobileBottomNavProps {
  activeView: string;
  onSelectView: (view: string) => void;
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
  lastReadingSession,
  onResumeReading,
}) => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  // PAINEL-2 (D-14): três destinos — Início (a tela de entrada, com o desempenho e o
  // caminho para o caderno de erros), Biblioteca e Questões (com os Simulados
  // dentro) — e, para o admin, o CMS. "Hoje", "Meu desempenho" e o menu "Recursos"
  // saíram.
  const navItems = [
    {
      id: 'dashboard',
      label: 'Início',
      icon: LayoutDashboard,
      isActive: activeView === 'dashboard' || activeView === 'errors',
    },
    {
      id: 'compendiums',
      label: 'Biblioteca',
      icon: BookOpen,
      isActive: activeView === 'compendiums' || activeView === 'compendium-reader',
    },
    {
      id: 'questions',
      label: 'Questões',
      icon: HelpCircle,
      isActive: ['questions', 'simulados', 'simulado-session'].includes(activeView),
    },
    ...(isAdmin
      ? [
          {
            id: 'admin',
            label: 'CMS',
            icon: Database,
            isActive: activeView === 'admin',
          },
        ]
      : []),
  ];

  const isReading = activeView === 'compendium-reader';
  const isSimuladoSession = activeView === 'simulado-session';

  return (
    <div className="fixed bottom-4 sm:bottom-5 left-1/2 -translate-x-1/2 z-40 w-auto max-w-[94vw] flex flex-col items-center gap-2 pointer-events-none">
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
        className="pointer-events-auto flex items-center justify-center gap-1 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-2xl bg-white/98 dark:bg-[#0A1220]/98 backdrop-blur-2xl border border-slate-300/90 dark:border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.7)] transition-all"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.isActive;

          return (
            <button
              key={item.id}
              type="button"
              id={`dock-nav-${item.id}`}
              onClick={() => onSelectView(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center py-1.5 px-3 sm:px-4 rounded-xl transition-all cursor-pointer min-w-[56px] sm:min-w-[64px] ${
                isActive
                  ? 'bg-teal-600/15 dark:bg-teal-400/20 text-teal-950 dark:text-teal-100 font-bold border border-teal-600/40 dark:border-teal-400/50 shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 border border-transparent font-medium'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-4 h-4 transition-transform ${
                    isActive ? 'scale-110 text-teal-600 dark:text-teal-400' : ''
                  }`}
                />
              </div>
              <span className="text-[10px] sm:text-[11px] mt-0.5 tracking-tight truncate">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
