import React, { useState } from 'react';
import {
  Printer,
  Copy,
  Check,
  X,
  FileText,
  Filter,
} from 'lucide-react';
import { Question, QuestionAnswerRecord, ErrorLogItem, Discipline } from '../../types';
import { useDialogA11y } from '../../hooks/useDialogA11y';

interface ExportCadernoModalProps {
  isOpen: boolean;
  onClose: () => void;
  mistakes: Array<{ question: Question; answer: QuestionAnswerRecord }>;
  errorLogs: Record<string, ErrorLogItem>;
  disciplines: Discipline[];
}

export const ExportCadernoModal: React.FC<ExportCadernoModalProps> = ({
  isOpen,
  onClose,
  mistakes,
  errorLogs,
  disciplines,
}) => {
  const [filterOnlyNotes, setFilterOnlyNotes] = useState(false);
  const [filterOnlyPending, setFilterOnlyPending] = useState(true);
  const [copied, setCopied] = useState(false);

  const dialogRef = useDialogA11y<HTMLDivElement>({ isOpen, onClose });

  if (!isOpen) return null;

  const disciplineMap = new Map(disciplines.map((d) => [d.id, d.name]));

  const filtered = mistakes.filter(({ question }) => {
    const log = errorLogs[question.id];
    if (filterOnlyPending && log?.resolved) return false;
    if (filterOnlyNotes && (!log?.userNotes || log.userNotes.trim().length === 0)) return false;
    return true;
  });

  const generateMarkdown = () => {
    let md = `# Dossiê de Reta Final — NexusMed\n`;
    md += `*Compilado de Pontos Cegos e Fixação Clínica | ${new Date().toLocaleDateString('pt-BR')}*\n\n`;
    md += `Total de questões selecionadas: ${filtered.length}\n\n---\n\n`;

    filtered.forEach(({ question }, index) => {
      const log = errorLogs[question.id];
      const disc = disciplineMap.get(question.disciplineId) || 'Medicina';
      md += `### ${index + 1}. [${question.institution} ${question.year}] ${disc}\n\n`;
      md += `> **Enunciado / Caso:** ${question.clinicalVignette || question.questionStem}\n\n`;

      if (log?.errorReason) {
        md += `- **Causa do Erro Identificada:** ${log.errorReason.replace('_', ' ').toUpperCase()}\n`;
      }
      if (log?.userNotes) {
        md += `- **Anotação de Fixação Pessoal:** ${log.userNotes}\n`;
      }
      if (question.highYieldSummary) {
        md += `- **Pérola de Prova / Diretriz de Ouro:** ${question.highYieldSummary}\n`;
      }
      md += `\n---\n\n`;
    });

    return md;
  };

  const handleCopyMarkdown = async () => {
    const md = generateMarkdown();
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = md;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-caderno-title"
        className="bg-white dark:bg-[#0E1726] rounded-3xl border border-slate-300 dark:border-[#243452] shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 id="export-caderno-title" className="text-lg font-bold tracking-tight">
                Dossiê de Reta Final — Caderno de Erros
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Exporte suas pérolas e anotações para revisão rápida na véspera da prova
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Filtros de Exportação */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer font-medium select-none">
              <input
                type="checkbox"
                checked={filterOnlyPending}
                onChange={(e) => setFilterOnlyPending(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500"
              />
              <span>Apenas não resolvidas</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer font-medium select-none">
              <input
                type="checkbox"
                checked={filterOnlyNotes}
                onChange={(e) => setFilterOnlyNotes(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500"
              />
              <span>Apenas com anotações de estudo</span>
            </label>
          </div>

          <span className="font-bold text-teal-700 dark:text-teal-400">
            {filtered.length} {filtered.length === 1 ? 'questão selecionada' : 'questões selecionadas'}
          </span>
        </div>

        {/* Prévia Formatada para Impressão e Leitura */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <Filter className="w-8 h-8 mx-auto opacity-40" />
              <p>Nenhuma questão atende aos filtros de exportação selecionados.</p>
            </div>
          ) : (
            filtered.map(({ question }, idx) => {
              const log = errorLogs[question.id];
              const disc = disciplineMap.get(question.disciplineId) || 'Medicina';

              return (
                <div
                  key={question.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-teal-700 dark:text-teal-400">
                      {idx + 1}. {question.institution} ({question.year}) • {disc}
                    </span>
                    {log?.errorReason && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-bold uppercase text-[10px]">
                        {log.errorReason.replace('_', ' ')}
                      </span>
                    )}
                  </div>

                  <p className="text-slate-800 dark:text-slate-200 font-serif-reading leading-relaxed line-clamp-3">
                    {question.clinicalVignette || question.questionStem}
                  </p>

                  {log?.userNotes && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/30 text-amber-900 dark:text-amber-200">
                      <strong className="block text-[10px] uppercase tracking-wider mb-0.5">Sua Nota de Fixação:</strong>
                      {log.userNotes}
                    </div>
                  )}

                  {question.highYieldSummary && (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-900 dark:text-emerald-200">
                      <strong className="block text-[10px] uppercase tracking-wider mb-0.5">Pérola de Prova:</strong>
                      {question.highYieldSummary}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé com Ações */}
        <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
            Ideal para imprimir antes do dia da prova ou importar no seu Notion / Obsidian.
          </span>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyMarkdown}
              disabled={filtered.length === 0}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Copiado em Markdown!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-500" />
                  <span>Copiar Markdown</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={filtered.length === 0}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer elev-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
