import React, { useState } from 'react';
import {
  BookOpen,
  HelpCircle,
  Layers,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  UserPlus,
  LogIn,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { Logo } from '../common/Logo';

export const LoginView: React.FC = () => {
  const {
    loginWithGoogle,
    loginWithDemo,
    loginWithEmail,
    registerWithEmail,
    loginError,
    clearError,
    isConfigured,
  } = useAuth();

  // Mode: 'login' | 'register'
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Forgot password modal
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  const activeError = validationError || loginError;

  const handleTabSwitch = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setValidationError(null);
    clearError();
    setPassword('');
    setConfirmPassword('');
  };

  const handleGoogleLogin = async () => {
    setValidationError(null);
    clearError();
    try {
      setIsSubmitting(true);
      await loginWithGoogle();
    } catch {
      // O erro já é registrado em loginError pelo AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    clearError();

    // Validações básicas no cliente
    if (!email.trim()) {
      setValidationError('Por favor, informe seu endereço de e-mail.');
      return;
    }

    if (!password) {
      setValidationError('Por favor, informe sua senha de acesso.');
      return;
    }

    if (password.length < 6) {
      setValidationError('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    if (authMode === 'register') {
      if (!name.trim()) {
        setValidationError('Por favor, informe seu nome completo.');
        return;
      }

      if (name.trim().length < 3) {
        setValidationError('O nome informado é muito curto.');
        return;
      }

      if (password !== confirmPassword) {
        setValidationError('A confirmação de senha não coincide com a senha digitada.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (authMode === 'login') {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(name, email, password);
      }
      // O formulário conclui e o onAuthStateChanged redireciona
    } catch {
      // Erro manipulado pelo AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="login-view"
      className="min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors"
    >
      {/* Coluna Esquerda: Apresentação Editorial e Valor Acadêmico */}
      <div className="md:w-1/2 lg:w-7/12 p-8 md:p-14 lg:p-18 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm">
        <div>
          {/* Logo e Nome */}
          <div className="flex items-center gap-3 mb-10">
            <Logo className="w-12 h-12 rounded-xl elev-md shadow-teal-700/20" />
            <div>
              <span className="text-2xl font-bold font-serif-reading tracking-tight text-slate-900 dark:text-white">
                NexusMed
              </span>
              <span className="block text-xs uppercase font-semibold tracking-wider text-teal-700 dark:text-teal-400">
                Área Médica & Fisiopatologia
              </span>
            </div>
          </div>

          {/* Headline Editorial */}
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/80 text-teal-800 dark:text-teal-300 text-xs font-semibold mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Base Teórica & Prática para Residência Médica</span>
            </div>

            <h1 className="text-3xl lg:text-4xl font-serif-reading font-bold text-slate-900 dark:text-white leading-tight mb-4">
              Aprofundamento clínico com rigor fisiopatológico e repetição espaçada.
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed mb-8">
              Uma plataforma integrada de ensino médico que une compêndios editoriais aprofundados,
              banco de questões comentadas alternativa por alternativa e algoritmo SRS SM-2.
            </p>
          </div>

          {/* Pilares da Plataforma */}
          <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 elev-xs">
              <div className="flex items-center gap-2.5 text-teal-700 dark:text-teal-400 font-semibold text-sm mb-1.5">
                <BookOpen className="w-4 h-4" />
                <span>Compêndios & Atlas</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Mecanismos moleculares, pérolas clínicas, controvérsias e condutas baseadas em evidências.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 elev-xs">
              <div className="flex items-center gap-2.5 text-teal-700 dark:text-teal-400 font-semibold text-sm mb-1.5">
                <HelpCircle className="w-4 h-4" />
                <span>Questões & Caderno</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Comentários detalhados, categorização de causas de erro e ancoragem direta na teoria.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 elev-xs">
              <div className="flex items-center gap-2.5 text-teal-700 dark:text-teal-400 font-semibold text-sm mb-1.5">
                <Layers className="w-4 h-4" />
                <span>Flashcards SRS (SM-2)</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                Retenção de longo prazo com curvas de esquecimento adaptadas ao seu ritmo de estudo.
              </p>
            </div>

          </div>
        </div>

        {/* Rodapé institucional */}
        <div className="mt-10 pt-6 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Ambiente acadêmico para estudantes e residentes de Medicina</span>
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            Acesso Seguro
          </span>
        </div>
      </div>

      {/* Coluna Direita: Painel de Autenticação */}
      <div className="md:w-1/2 lg:w-5/12 p-6 sm:p-10 lg:p-14 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-950 overflow-y-auto">
        <div className="w-full max-w-md my-auto">
          {/* Header do Formulário */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-serif-reading font-bold text-slate-900 dark:text-white mb-2">
              {authMode === 'login' ? 'Acesse sua conta' : 'Crie sua conta de estudante'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              {authMode === 'login'
                ? 'Entre para sincronizar seu plano de estudos, simulados e revisões diárias.'
                : 'Cadastre-se para iniciar seus estudos com acompanhamento por repetição espaçada.'}
            </p>
          </div>

          {/* Abas Alternadoras: Entrar vs. Cadastre-se */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/70 rounded-xl mb-6 text-xs font-semibold">
            <button
              type="button"
              id="tab-login-mode"
              onClick={() => handleTabSwitch('login')}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                authMode === 'login'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white elev-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Entrar</span>
            </button>
            <button
              type="button"
              id="tab-register-mode"
              onClick={() => handleTabSwitch('register')}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                authMode === 'register'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white elev-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Cadastre-se</span>
            </button>
          </div>

          {/* Alerta de erro */}
          {activeError && (
            <div
              id="auth-error-banner"
              className="mb-5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div className="flex-1 leading-relaxed">
                <span>{activeError}</span>
              </div>
            </div>
          )}

          {/* Aviso quando o Supabase opera em modo local */}
          {!isConfigured && (
            <div
              id="auth-not-configured-notice"
              className="mb-5 p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-200 text-xs"
            >
              <div className="flex items-center gap-1.5 font-semibold mb-1">
                <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>Modo Local / Demonstração Ativo</span>
              </div>
              <p className="leading-relaxed text-teal-800 dark:text-teal-300">
                O aplicativo está pronto para uso offline/local com todas as matérias, questões comentadas e flashcards carregados. Você pode clicar no botão rápido abaixo ou entrar com qualquer e-mail.
              </p>
            </div>
          )}

          {/* Formulário Principal: E-mail e Senha */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Campo Nome (Apenas no Cadastro) */}
            {authMode === 'register' && (
              <div>
                <label
                  htmlFor="register-name-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Nome Completo
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="register-name-input"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dra. Ana Silva ou Carlos Souza"
                    className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition-all"
                  />
                </div>
              </div>
            )}

            {/* Campo E-mail */}
            <div>
              <label
                htmlFor="auth-email-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                E-mail
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="auth-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@faculdade.edu.br"
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition-all"
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="auth-password-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Senha
                </label>
                {authMode === 'login' && (
                  <button
                    type="button"
                    onClick={() => setIsForgotModalOpen(true)}
                    className="text-[11px] font-medium text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="auth-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  className="w-full h-11 pl-10 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Campo Confirmar Senha (Apenas no Cadastro) */}
            {authMode === 'register' && (
              <div>
                <label
                  htmlFor="register-confirm-password-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Confirmar Senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="register-confirm-password-input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a mesma senha"
                    className="w-full h-11 pl-10 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    aria-label={showConfirmPassword ? 'Ocultar senha' : 'Exibir senha'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Um e-mail de confirmação será enviado para você validar sua conta antes do primeiro acesso.
                </p>
              </div>
            )}

            {/* Botão de Envio (Entrar ou Cadastrar) */}
            <button
              id="btn-auth-submit"
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-[0.99] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer elev-md shadow-teal-700/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              <span>
                {isSubmitting
                  ? authMode === 'login'
                    ? 'Entrando...'
                    : 'Criando conta...'
                  : authMode === 'login'
                  ? 'Acessar Plataforma'
                  : 'Criar Conta de Estudante'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {/* Acesso rápido em modo demonstração — em desenvolvimento/preview do AI Studio
                (import.meta.env.DEV) ou quando o Supabase não está configurado (!isConfigured).
                Em produção real (Vercel / vite build), import.meta.env.DEV é false e
                isConfigured é true, portanto este botão nunca é renderizado,
                respeitando estritamente a armadilha #6 do AGENTS.md. */}
            {(!isConfigured || import.meta.env.DEV) && (
              <button
                id="btn-demo-quick-login"
                type="button"
                disabled={isSubmitting}
                onClick={async () => {
                  try {
                    setIsSubmitting(true);
                    await loginWithDemo();
                  } catch {
                    // handled by context
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="w-full h-10 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer border border-slate-300 dark:border-slate-700 transition-all mt-2"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Acesso Rápido de Demonstração (1-Clique)</span>
              </button>
            )}
          </form>

          {/* Divisor "ou continue com" */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-slate-50/50 dark:bg-slate-950 text-slate-400 dark:text-slate-500 text-[11px] uppercase tracking-wider font-semibold">
                ou continue com
              </span>
            </div>
          </div>

          {/* Botão Oficial: Entrar com o Google */}
          <div>
            <button
              id="btn-google-login"
              type="button"
              disabled={isSubmitting}
              onClick={handleGoogleLogin}
              className="w-full h-11 px-5 rounded-xl border flex items-center justify-center gap-3 text-xs font-semibold transition-all elev-xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:border-slate-400 active:scale-[0.99] cursor-pointer"
            >
              {/* Ícone Oficial do Google */}
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isSubmitting ? 'Conectando ao Google...' : 'Entrar com Google'}</span>
            </button>
            <p className="mt-2 text-[11px] text-center text-slate-400 dark:text-slate-500 leading-tight">
              Em janelas embutidas (preview), a autenticação do Google abrirá em uma nova janela para conformidade com as regras de segurança.
            </p>
          </div>

          {/* Informações sobre Papel & Privacidade */}
          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-center space-y-1.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Novas contas iniciam no perfil <strong className="text-slate-700 dark:text-slate-300">Estudante</strong> com plano Free.
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Autenticação gerenciada pelo Supabase Auth, com senhas armazenadas como hash (nunca em texto plano) e tráfego protegido por HTTPS/TLS.
            </p>
          </div>
        </div>
      </div>

      {/* Modal de Esqueci Minha Senha */}
      <ForgotPasswordModal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        defaultEmail={email}
      />
    </div>
  );
};
