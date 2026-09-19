import React, { useState } from 'react';
import { Mail, X, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getOptionalErrorMessage } from '../../utils/errorMessage';
import { useDialogA11y } from '../../hooks/useDialogA11y';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  defaultEmail = '',
}) => {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState(defaultEmail);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClose = () => {
    setIsSuccess(false);
    setErrorMsg(null);
    onClose();
  };

  const dialogRef = useDialogA11y<HTMLDivElement>({ isOpen, onClose: handleClose });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg('Por favor, informe seu endereço de e-mail.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await sendPasswordReset(email.trim());
      setIsSuccess(true);
    } catch (err: unknown) {
      setErrorMsg(getOptionalErrorMessage(err) || 'Não foi possível enviar o e-mail de recuperação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="forgot-password-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-password-title"
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl elev-2xl p-6 relative"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h3 id="forgot-password-title" className="text-base font-bold font-serif-reading text-slate-900 dark:text-white">
              Recuperação de Senha
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Redefina o acesso à sua conta NexusMed
            </p>
          </div>
        </div>

        {isSuccess ? (
          <div className="py-4 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                E-mail de Recuperação Enviado!
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Enviamos instruções detalhadas com o link para redefinição de senha para{' '}
                <strong className="text-slate-900 dark:text-white font-mono">{email}</strong>.
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                Verifique também sua pasta de spam caso não visualize a mensagem na caixa principal em alguns minutos.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="w-full h-11 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer transition-colors elev-xs"
            >
              Concluir e Voltar ao Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Informe o e-mail cadastrado na plataforma. Enviaremos um link exclusivo para você definir uma nova senha com total segurança.
            </p>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="reset-email-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                E-mail da sua conta
              </label>
              <input
                id="reset-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@faculdade.edu.br"
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition-all"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 h-11 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 h-11 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-[0.99] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all elev-xs cursor-pointer disabled:opacity-60"
              >
                <span>{isSubmitting ? 'Enviando link...' : 'Enviar Link'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
