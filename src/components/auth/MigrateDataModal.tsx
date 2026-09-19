import React, { useState } from 'react';
import { Database, AlertTriangle, ShieldCheck } from 'lucide-react';
import { MigrationSummary } from '../../types';
import { StorageService } from '../../services/storage';
import { getOptionalErrorMessage } from '../../utils/errorMessage';

interface MigrateDataModalProps {
  summary: MigrationSummary;
  userUid: string;
  userName?: string | null;
  onComplete: () => void;
}

export const MigrateDataModal: React.FC<MigrateDataModalProps> = ({
  summary,
  userUid,
  userName,
  onComplete,
}) => {
  const [keepCopy, setKeepCopy] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleMigrate = () => {
    setIsProcessing(true);
    setError(null);
    try {
      const result = StorageService.migrateLegacyData(userUid, keepCopy);
      if (result.success) {
        onComplete();
      } else {
        setError(result.error || 'Erro durante a migração de dados.');
      }
    } catch (err: unknown) {
      setError(getOptionalErrorMessage(err) || 'Erro inesperado.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDismiss = () => {
    StorageService.dismissMigration(userUid);
    onComplete();
  };

  return (
    <div
      id="migrate-data-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div
        id="migrate-data-modal-content"
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 elev-2xl overflow-hidden transition-colors"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-serif-reading font-bold text-slate-900 dark:text-white">
              Histórico Local Encontrado
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Detectamos registros de estudos realizados anteriormente neste navegador.
            </p>
          </div>
        </div>

        {/* Corpo do Modal com Resumo dos Dados */}
        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            Deseja associar esse progresso à sua conta conectada{' '}
            <strong className="text-slate-900 dark:text-white">
              {userName || 'Google'}
            </strong>
            ?
          </p>

          {/* Resumo em cards */}
          <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/70 dark:border-slate-800">
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500 dark:text-slate-400">Questões Respondidas:</span>
              <strong className="text-slate-800 dark:text-slate-200">{summary.answersCount}</strong>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500 dark:text-slate-400">Flashcards:</span>
              <strong className="text-slate-800 dark:text-slate-200">{summary.flashcardsCount}</strong>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500 dark:text-slate-400">Simulados Feitos:</span>
              <strong className="text-slate-800 dark:text-slate-200">{summary.simuladosCount}</strong>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-500 dark:text-slate-400">Itens Favoritados:</span>
              <strong className="text-slate-800 dark:text-slate-200">{summary.bookmarksCount}</strong>
            </div>
            {summary.notesCount > 0 && (
              <div className="flex items-center justify-between py-1 col-span-2">
                <span className="text-slate-500 dark:text-slate-400">Anotações Pessoais:</span>
                <strong className="text-slate-800 dark:text-slate-200">{summary.notesCount}</strong>
              </div>
            )}
          </div>

          {/* Opção de manter ou não cópia de segurança */}
          <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
            <input
              type="checkbox"
              id="checkbox-keep-copy"
              checked={keepCopy}
              onChange={(e) => setKeepCopy(e.target.checked)}
              aria-label="Manter cópia de segurança dos dados originais"
              className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
            />
            <div className="text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                Manter cópia de segurança dos dados originais
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                Se desmarcado, os dados serão validados e transferidos com segurança para o seu usuário, liberando as chaves anteriores.
              </span>
            </div>
          </label>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer com Ações */}
        <div className="p-6 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/50">
          <button
            type="button"
            id="btn-dismiss-migration"
            onClick={handleDismiss}
            disabled={isProcessing}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            Iniciar com conta vazia (Não associar)
          </button>

          <button
            type="button"
            id="btn-confirm-migration"
            onClick={handleMigrate}
            disabled={isProcessing}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white elev-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isProcessing ? 'Validando e Migrando...' : 'Associar à Minha Conta'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
