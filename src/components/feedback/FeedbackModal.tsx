import React, { useState } from 'react';
import { X, MessageSquarePlus, Lightbulb, AlertTriangle, Heart, CheckCircle2, Send } from 'lucide-react';
import { FeedbackType, UserFeedback } from '../../types';
import { feedbackRepository } from '../../repositories/FeedbackRepository';
import { useAuth } from '../../contexts/AuthContext';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
  const { user, profile } = useAuth();
  const [type, setType] = useState<FeedbackType>('sugestao');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Por favor, preencha o título e a descrição do feedback.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const feedbackItem: UserFeedback = {
        id: crypto.randomUUID(),
        type,
        title: title.trim(),
        description: description.trim(),
        createdAt: new Date().toISOString(),
        userId: user?.id || null,
        userEmail: user?.email || profile?.email || null,
        status: 'pendente',
      };

      await feedbackRepository.saveFeedback(feedbackItem);

      setIsSubmitting(false);
      setSubmitted(true);
    } catch {
      setIsSubmitting(false);
      setError('Ocorreu um erro ao registrar seu feedback. Tente novamente.');
    }
  };

  const handleResetAndClose = () => {
    setTitle('');
    setDescription('');
    setType('sugestao');
    setSubmitted(false);
    setError(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 elev-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 flex items-center justify-center border border-teal-200 dark:border-teal-800/60">
              <MessageSquarePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 id="feedback-modal-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                Enviar Feedback
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ajude a aprimorar o NexusMed neste ambiente de estudos colaborativo
              </p>
            </div>
          </div>

          <button
            onClick={handleResetAndClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {submitted ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-300 dark:border-emerald-800">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Feedback Registrado!
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                Muito obrigado por sua contribuição. Seu relato foi salvo no seu ambiente pessoal e será considerado nas próximas atualizações da plataforma.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold elev-xs transition-colors cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs">
                {error}
              </div>
            )}

            {/* Type selector */}
            <div className="space-y-1.5">
              {/* Rótulo de um grupo de botões (não de um único controle nativo) —
                  `span`, não `label`, para não disparar falso positivo de
                  jsx-a11y/label-has-associated-control. */}
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Tipo de Relato
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setType('sugestao')}
                  className={`p-3 rounded-2xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    type === 'sugestao'
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 elev-xs'
                      : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Sugestão</span>
                </button>

                <button
                  type="button"
                  onClick={() => setType('problema')}
                  className={`p-3 rounded-2xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    type === 'problema'
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-300 elev-xs'
                      : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>Problema</span>
                </button>

                <button
                  type="button"
                  onClick={() => setType('elogio')}
                  className={`p-3 rounded-2xl border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    type === 'elogio'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 elev-xs'
                      : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Heart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Elogio</span>
                </button>
              </div>
            </div>

            {/* Quick Topic Chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Assunto Rápido (clique para preencher o título)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(type === 'problema'
                  ? [
                      'Erro de gabarito em questão',
                      'Erro conceitual / diretriz médica',
                      'Erro de digitação / formatação',
                      'Lentidão ou bug visual',
                      'Imagem ou tabela ilegível',
                    ]
                  : type === 'sugestao'
                  ? [
                      'Sugestão de funcionalidade',
                      'Mais questões desta especialidade',
                      'Melhoria visual ou atalhos',
                      'Novo compêndio temático',
                    ]
                  : [
                      'Qualidade dos comentários',
                      'Design fluido e agradável',
                      'Excelente compêndio teórico',
                    ]
                ).map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setTitle(chip)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                      title === chip
                        ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-700 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <label htmlFor="feedback-title" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Título do Feedback
              </label>
              <input
                id="feedback-title"
                type="text"
                placeholder="Ex: Erro no gabarito da questão X / Sugestão de filtro"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                required
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/40"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label htmlFor="feedback-description" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Descrição Detalhada
              </label>
              <textarea
                id="feedback-description"
                rows={4}
                placeholder="Conte com detalhes o que aconteceu, sua ideia de melhoria ou o que mais gostou..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                required
                className="w-full p-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/40 resize-none"
              />
              <div className="text-right text-[10px] text-slate-400">
                {description.length}/1000 caracteres
              </div>
            </div>

            {/* Footer */}
            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold elev-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Registrando...' : 'Enviar Feedback'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
