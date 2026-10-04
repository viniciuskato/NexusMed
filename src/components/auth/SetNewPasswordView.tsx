import React, { useState } from 'react';
import { KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getOptionalErrorMessage } from '../../utils/errorMessage';

const MIN_PASSWORD_LENGTH = 6;

/**
 * Tela aberta pelo link do e-mail de "Esqueci a senha" (evento
 * PASSWORD_RECOVERY do Supabase): define a senha nova da conta (45-F, AUD-01).
 */
export const SetNewPasswordView: React.FC = () => {
  const { updatePassword, finishPasswordRecovery, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMsg(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setErrorMsg('As duas senhas precisam ser iguais.');
      return;
    }
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err: unknown) {
      setErrorMsg(getOptionalErrorMessage(err) || 'Não foi possível salvar a senha nova. Tente de novo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition-all';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4 sm:p-6 transition-colors">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 elev-xl p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 flex items-center justify-center">
            <KeyRound className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Definir senha nova</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Escolha a senha que você vai usar para entrar.</p>
          </div>
        </div>

        {done ? (
          <div className="space-y-4 text-center py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Senha atualizada</h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">Da próxima vez, entre com a senha nova.</p>
            </div>
            <button
              type="button"
              onClick={finishPasswordRecovery}
              className="w-full h-11 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              Continuar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
            )}
            <div>
              <label htmlFor="new-password-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nova senha
              </label>
              <input
                id="new-password-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="confirm-password-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Confirmar nova senha
              </label>
              <input
                id="confirm-password-input"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
              />
            </div>
            <button
              id="btn-set-password"
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer transition-colors disabled:opacity-60"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar senha nova'}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              Sair sem trocar a senha
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
