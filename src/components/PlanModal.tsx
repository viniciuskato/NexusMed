import React from 'react';
import {
  Check,
  Sparkles,
  X,
  BookOpen,
  HelpCircle,
  Layers,
  BarChart3,
  Users,
} from 'lucide-react';
import { UserPlan } from '../types';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan: UserPlan;
  onSelectPlan: (plan: UserPlan) => void;
}

export const PlanModal: React.FC<PlanModalProps> = ({
  isOpen,
  onClose,
}) => {
  const dialogRef = useDialogA11y<HTMLDivElement>({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-modal-title"
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl elev-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 sm:p-8 bg-gradient-to-br from-teal-50 via-white to-cyan-50 dark:bg-slate-900 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 text-slate-900 dark:text-white relative">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 text-xs font-semibold mb-3 border border-teal-400/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Acesso Colaborativo NexusMed</span>
          </div>
          <h2 id="plan-modal-title" className="text-xl sm:text-2xl font-bold tracking-tight">
            Ambiente Acadêmico de Acesso Livre
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm mt-2 leading-relaxed">
            O NexusMed é uma plataforma médica de estudos e colaboração privada. Todas as ferramentas e recursos estão integralmente disponíveis para o grupo de estudo.
          </p>
        </div>

        {/* Features list */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-4 bg-slate-50/50 dark:bg-slate-900/50 text-xs">
          <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/40 flex items-start gap-3">
            <Users className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-teal-950 dark:text-teal-200">Sem Assinaturas ou Mensalidades</h4>
              <p className="text-teal-900/80 dark:text-teal-300/80 mt-0.5 leading-relaxed">
                Este espaço é mantido para estudos compartilhados entre colegas e amigos. Não há cobranças, restrições de tempo ou limites de uso.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {[
              { icon: BookOpen, title: 'Biblioteca Médica', desc: 'Compêndios com lentes de estudo, árvores de decisão e fisiopatologia.' },
              { icon: HelpCircle, title: 'Questões e Simulados', desc: 'Resolução comentada alternativa por alternativa e caderno de erros integrado.' },
              { icon: Layers, title: 'Revisão Espaçada (SRS)', desc: 'Algoritmo SM-2 para consolidação de memória de longo prazo.' },
              { icon: BarChart3, title: 'Diagnóstico de Desempenho', desc: 'Mapeamento contínuo de lacunas e evolução por especialidade.' },
              { icon: Check, title: 'Armazenamento Seguro', desc: 'Seus dados e anotações pessoais isolados com total privacidade.' },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                    <Icon className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span>{item.title}</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs elev-xs transition-colors cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
