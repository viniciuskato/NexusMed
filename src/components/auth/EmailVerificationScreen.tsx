import React, { useState, useEffect } from 'react';
import {
  Mail,
  RefreshCw,
  Send,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Stethoscope,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const EmailVerificationScreen: React.FC = () => {
  const { user, sendVerificationEmail, reloadUser, logout } = useAuth();
  const [isReloading, setIsReloading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [cooldown, setCooldown] = useState<number>(0);

  // Countdown timer for resend button
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleCheckVerification = async () => {
    setMessage(null);
    setIsReloading(true);
    try {
      const isVerified = await reloadUser();
      if (!isVerified) {
        setMessage({
          type: 'info',
          text: 'Seu e-mail ainda consta como pendente de confirmação. Por favor, abra o link enviado para sua caixa de entrada e tente novamente.',
        });
      }
    } catch {
      setMessage({
        type: 'error',
        text: 'Não foi possível verificar o status no momento. Tente novamente em instantes.',
      });
    } finally {
      setIsReloading(false);
    }
  };

  const handleResendEmail = async () => {
    if (cooldown > 0) return;
    setMessage(null);
    setIsSending(true);
    try {
      await sendVerificationEmail();
      setMessage({
        type: 'success',
        text: `Link de confirmação reenviado com sucesso para ${user?.email || 'seu e-mail'}. Verifique sua caixa de entrada e a pasta de spam.`,
      });
      setCooldown(60); // 60 segundos de intervalo para evitar flood
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || 'Ocorreu um erro ao reenviar o e-mail de verificação. Aguarde alguns instantes.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      id="email-verification-screen"
      className="min-h-screen bg-slate-100/70 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6"
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 elev-xl text-center relative overflow-hidden">
        {/* Accent top banner */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-teal-500 to-emerald-500" />

        {/* Logo NexusMed */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center elev-xs">
            <Stethoscope className="w-5 h-5" />
          </div>
          <span className="font-serif-reading font-bold text-xl text-slate-900 dark:text-white">
            NexusMed
          </span>
        </div>

        {/* Envelope Icon */}
        <div className="w-16 h-16 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/80 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-5 elev-xs">
          <Mail className="w-8 h-8" />
        </div>

        {/* Title & Instructions */}
        <h1 className="text-2xl font-serif-reading font-bold text-slate-900 dark:text-white mb-2">
          Confirmação de E-mail Obrigatória
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
          Para garantir a integridade dos seus dados de estudo e o acesso seguro à plataforma, enviamos um link de confirmação para:
        </p>

        {/* User Email Pill */}
        <div className="inline-block px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 mb-6 max-w-full truncate font-mono">
          {user?.email || 'seu e-mail'}
        </div>

        {/* Feedback Message */}
        {message && (
          <div
            id="verification-feedback-alert"
            className={`mb-6 p-4 rounded-xl text-xs flex items-start gap-2.5 text-left transition-all ${
              message.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : message.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                : 'bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            )}
            <span className="leading-relaxed">{message.text}</span>
          </div>
        )}

        {/* Steps Box */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-left mb-8">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Como ativar sua conta de estudante:
          </span>
          <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 list-decimal list-inside">
            <li>Abra a caixa de entrada do seu e-mail cadastrado.</li>
            <li>Localize o e-mail de verificação da NexusMed.</li>
            <li>Clique no link seguro de confirmação.</li>
            <li>Retorne a esta tela e clique em <strong>"Já confirmei meu e-mail"</strong>.</li>
          </ol>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {/* Button 1: Reload / Check Verification */}
          <button
            id="btn-check-email-verification"
            type="button"
            disabled={isReloading}
            onClick={handleCheckVerification}
            className="w-full h-12 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-[0.99] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer elev-md shadow-teal-700/20 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`} />
            <span>{isReloading ? 'Verificando status...' : 'Já confirmei meu e-mail'}</span>
          </button>

          {/* Button 2: Resend Verification Email */}
          <button
            id="btn-resend-verification-email"
            type="button"
            disabled={isSending || cooldown > 0}
            onClick={handleResendEmail}
            className={`w-full h-11 rounded-xl border text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all ${
              cooldown > 0
                ? 'bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer'
            }`}
          >
            {cooldown > 0 ? (
              <>
                <Clock className="w-4 h-4" />
                <span>Aguarde {cooldown}s para reenviar</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>{isSending ? 'Enviando link...' : 'Reenviar e-mail de confirmação'}</span>
              </>
            )}
          </button>

          {/* Button 3: Logout */}
          <button
            id="btn-logout-unverified"
            type="button"
            onClick={logout}
            className="w-full h-10 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair / Entrar com outra conta</span>
          </button>
        </div>

        {/* Tip */}
        <p className="mt-6 text-[11px] text-slate-400 dark:text-slate-500">
          Não encontrou o e-mail? Verifique também sua pasta de <strong>Spam</strong> ou <strong>Lixo Eletrônico</strong>.
        </p>
      </div>
    </div>
  );
};
