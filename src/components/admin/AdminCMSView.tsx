import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Plus,
  BookOpen,
  HelpCircle,
  Layers,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Save,
  RotateCcw,
  Edit3,
  Search,
  Clock,
  Lightbulb,
  FileText,
  X,
  ChevronDown,
  Users,
  ShieldBan,
  ShieldCheck,
  MessageSquareWarning,
  ArrowRight,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { Discipline, Theme, Question, Compendium, Flashcard, CompendiumSection, UserFeedback } from '../../types';
import { StorageService } from '../../services/storage';
import { flashcardsRepository } from '../../repositories/FlashcardsRepository';
import { materialsRepository } from '../../repositories/MaterialsRepository';
import { questionsRepository } from '../../repositories/QuestionsRepository';
import { feedbackRepository } from '../../repositories/FeedbackRepository';
import { supabase } from '../../lib/supabaseClient';
import SectionEditor from './SectionEditor';
import ProvenanceReviewPanel from './ProvenanceReviewPanel';
import { getErrorMessage } from '../../utils/errorMessage';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useScrollMemory } from '../../hooks/useScrollMemory';

interface AdminProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  role: 'student' | 'admin';
  status: 'active' | 'pending' | 'blocked';
  created_at: string;
}

interface AdminCMSViewProps {
  disciplines: Discipline[];
  themes: Theme[];
  questions: Question[];
  compendiums: Compendium[];
  flashcards: Flashcard[];
  onRefreshData: () => void;
}

export const AdminCMSView: React.FC<AdminCMSViewProps> = ({
  disciplines,
  themes,
  questions,
  compendiums,
  flashcards,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = usePersistedState<
    'compendiums' | 'questions' | 'flashcards' | 'users' | 'feedback' | 'database'
  >('admin_active_tab', 'compendiums');
  useScrollMemory(`admin:${activeTab}`);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [highlightedQuestionId, setHighlightedQuestionId] = useState<string | null>(null);

  // ── Users/Approval State ───────────────────────────────────────
  const [profiles, setProfiles] = useState<AdminProfileRow[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [updatingProfileId, setUpdatingProfileId] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    setProfilesLoading(true);
    setProfilesError(null);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, display_name, role, status, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      setProfilesError(error.message);
    } else {
      setProfiles((data ?? []) as AdminProfileRow[]);
    }
    setProfilesLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      loadProfiles();
    }
  }, [activeTab, loadProfiles]);

  const handleSetProfileStatus = async (profile: AdminProfileRow, status: 'active' | 'blocked') => {
    setUpdatingProfileId(profile.id);
    const { error } = await supabase.rpc('admin_set_profile_status', {
      p_user_id: profile.id,
      p_role: profile.role,
      p_status: status,
    });
    setUpdatingProfileId(null);
    if (error) {
      showToast(`Erro ao atualizar ${profile.email}: ${error.message}`);
      return;
    }
    showToast(
      status === 'active' ? `${profile.email} aprovado(a).` : `${profile.email} bloqueado(a).`
    );
    loadProfiles();
  };

  const pendingCount = profiles.filter((p) => p.status === 'pending').length;

  // ── Feedback State ──────────────────────────────────────────────
  const [feedbackList, setFeedbackList] = useState<UserFeedback[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [updatingFeedbackId, setUpdatingFeedbackId] = useState<string | null>(null);
  const [reactionCounts, setReactionCounts] = useState<Record<string, { up: number; down: number }>>({});

  const loadFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const list = await feedbackRepository.getAllFeedback();
      setFeedbackList(list);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : String(err));
    }
    setFeedbackLoading(false);
  }, []);

  const loadReactionCounts = useCallback(async () => {
    const { data, error } = await supabase.from('question_reactions').select('question_id, reaction');
    if (error) return;
    const counts: Record<string, { up: number; down: number }> = {};
    for (const row of (data ?? []) as { question_id: string; reaction: 'up' | 'down' }[]) {
      if (!counts[row.question_id]) counts[row.question_id] = { up: 0, down: 0 };
      counts[row.question_id][row.reaction]++;
    }
    setReactionCounts(counts);
  }, []);

  useEffect(() => {
    if (activeTab === 'feedback') loadFeedback();
    if (activeTab === 'questions') loadReactionCounts();
  }, [activeTab, loadFeedback, loadReactionCounts]);

  const handleResolveFeedback = async (item: UserFeedback) => {
    setUpdatingFeedbackId(item.id);
    try {
      await feedbackRepository.updateFeedbackStatus(item.id, 'resolvido');
      showToast('Feedback marcado como resolvido.');
      await loadFeedback();
    } catch (err) {
      showToast(`Erro ao atualizar feedback: ${err instanceof Error ? err.message : String(err)}`);
    }
    setUpdatingFeedbackId(null);
  };

  const handleReopenFeedback = async (item: UserFeedback) => {
    setUpdatingFeedbackId(item.id);
    try {
      await feedbackRepository.updateFeedbackStatus(item.id, 'pendente');
      showToast('Feedback reaberto como pendente.');
      await loadFeedback();
    } catch (err) {
      showToast(`Erro ao atualizar feedback: ${err instanceof Error ? err.message : String(err)}`);
    }
    setUpdatingFeedbackId(null);
  };

  const handleOpenFeedbackTarget = (item: UserFeedback) => {
    if (item.materialId) {
      const comp = compendiums.find((c) => c.id === item.materialId);
      if (comp) {
        setActiveTab('compendiums');
        handleEditCompendium(comp);
        return;
      }
    }
    if (item.questionId) {
      setActiveTab('questions');
      setHighlightedQuestionId(item.questionId);
    }
  };

  useEffect(() => {
    if (activeTab === 'questions' && highlightedQuestionId) {
      const elem = document.getElementById(`admin-question-${highlightedQuestionId}`);
      if (elem) elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timeout = setTimeout(() => setHighlightedQuestionId(null), 3000);
      return () => clearTimeout(timeout);
    }
  }, [activeTab, highlightedQuestionId]);

  const [feedbackFilter, setFeedbackFilter] = useState<'todos' | 'pendentes' | 'resolvidos'>('todos');
  const feedbackPendingCount = feedbackList.filter((f) => f.status !== 'resolvido').length;

  // ── Compendium State ───────────────────────────────────────────
  const [isCompendiumFormOpen, setIsCompendiumFormOpen] = useState(false);
  const [editingCompId, setEditingCompId] = useState<string | null>(null);
  const [compSearch, setCompSearch] = useState('');
  // Editor de seção (piloto CMS) — guarda só o id, não o objeto Compendium,
  // para que o SectionEditor sempre receba a versão mais recente vinda de
  // onRefreshData (ver AGENTS.md / plano da feature).
  const [editingSectionsCompId, setEditingSectionsCompId] = useState<string | null>(null);
  const [openEditMenuCompId, setOpenEditMenuCompId] = useState<string | null>(null);

  // Revisão/atestação editorial (23-B) — painel único, reusado para
  // compêndio OU questão (nunca os dois ao mesmo tempo).
  const [provenanceTarget, setProvenanceTarget] = useState<
    { kind: 'material'; id: string; title: string } | { kind: 'question'; id: string; title: string } | null
  >(null);

  // Compendium Form Fields
  const [compTitle, setCompTitle] = useState('');
  const [compSubtitle, setCompSubtitle] = useState('');
  const [compDisciplineId, setCompDisciplineId] = useState(disciplines[0]?.id || 'cardio');
  const [compThemeId, setCompThemeId] = useState(themes[0]?.id || 'cardio-ic');
  const [compMode, setCompMode] = useState<'atlas' | 'mecanismos'>('mecanismos');
  const [compAuthor, setCompAuthor] = useState('Dr. Roberto Albuquerque / Comitê Editorial');
  const [compModuleNumber, setCompModuleNumber] = useState<string>('');
  const [compEstimatedTime, setCompEstimatedTime] = useState(15);
  const [compTagsStr, setCompTagsStr] = useState('Fisiopatologia, Clínica Médica, Alta Relevância');
  const [compDependenciesStr, setCompDependenciesStr] = useState('Anatomia Básica, Semiologia');
  const [compReferencesStr, setCompReferencesStr] = useState('Diretrizes Brasileiras / Sociedades Médicas de Especialidade');

  const [compSections, setCompSections] = useState<CompendiumSection[]>([
    {
      id: 'sec-1',
      title: '1. Fisiopatologia e Mecanismos Moleculares',
      mechanismTag: 'Fisiopatologia',
      content: 'Descreva detalhadamente a cascata fisiopatológica, receptores envolvidos, alterações hemodinâmicas ou histopatológicas.',
      keyTakeaways: ['Mecanismo primário de ativação', 'Correlação clínica fundamental'],
      clinicalPearl: 'Atenção aos sinais precoces de descompensação no exame físico.',
      warningAlert: 'Evitar terapias contraindicadas na presença de instabilidade hemodinâmica.',
    },
  ]);

  // ── Question Form State ─────────────────────────────────────────
  const [isCreatingQuestion, setIsCreatingQuestion] = useState(false);
  const [newQDiscipline, setNewQDiscipline] = useState(disciplines[0]?.id || '');
  const [newQTheme, setNewQTheme] = useState(themes[0]?.id || '');
  const [newQInstitution, setNewQInstitution] = useState('USP-SP / ENARE');
  const [newQYear, setNewQYear] = useState(2025);
  const [newQDifficulty, setNewQDifficulty] = useState<'facil' | 'medio' | 'dificil'>('medio');
  const [newQStem, setNewQStem] = useState('');
  const [newQVignette, setNewQVignette] = useState('');
  const [newQHighYield, setNewQHighYield] = useState('');
  const [optA, setOptA] = useState({ text: '', isCorrect: true, exp: '' });
  const [optB, setOptB] = useState({ text: '', isCorrect: false, exp: '' });
  const [optC, setOptC] = useState({ text: '', isCorrect: false, exp: '' });
  const [optD, setOptD] = useState({ text: '', isCorrect: false, exp: '' });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ── Compendium Form Handlers ────────────────────────────────────
  const handleOpenNewCompendium = () => {
    setEditingCompId(null);
    setCompTitle('');
    setCompSubtitle('');
    setCompDisciplineId(disciplines[0]?.id || 'cardio');
    setCompThemeId(themes[0]?.id || 'cardio-ic');
    setCompMode('mecanismos');
    setCompAuthor('Equipe Editorial NexusMed');
    setCompModuleNumber('');
    setCompEstimatedTime(15);
    setCompTagsStr('Fisiopatologia, Alta Relevância');
    setCompDependenciesStr('Bases Fisiológicas');
    setCompReferencesStr('Diretriz Oficial de Especialidade (2024)');
    setCompSections([
      {
        id: crypto.randomUUID(),
        title: '1. Fisiopatologia e Mecanismos Moleculares',
        mechanismTag: 'Fisiopatologia',
        content: 'Descreva a cascata fisiopatológica, receptores envolvidos e desdobramentos hemodinâmicos.',
        keyTakeaways: ['Ponto de ancoragem fisiopatológico principal'],
        clinicalPearl: 'Pérola de aplicação imediata no pronto-atendimento.',
        warningAlert: 'Erro clássico de diagnóstico diferencial.',
      },
    ]);
    setIsCompendiumFormOpen(true);
  };

  const handleEditCompendium = (comp: Compendium) => {
    setEditingCompId(comp.id);
    setCompTitle(comp.title);
    setCompSubtitle(comp.subtitle);
    setCompDisciplineId(comp.disciplineId);
    setCompThemeId(comp.themeId);
    setCompMode(comp.mode || 'mecanismos');
    setCompAuthor(comp.author);
    setCompModuleNumber(comp.moduleNumber ? String(comp.moduleNumber) : '');
    setCompEstimatedTime(comp.estimatedReadTimeMinutes);
    setCompTagsStr(comp.tags?.join(', ') || '');
    setCompDependenciesStr(comp.dependencies?.map((d) => d.title).join(', ') || '');
    setCompReferencesStr(comp.references.join('\n'));
    setCompSections(
      comp.sections.map((s, idx) => ({
        ...s,
        id: s.id || crypto.randomUUID(),
      }))
    );
    setIsCompendiumFormOpen(true);
  };

  const handleAddSection = () => {
    const nextIdx = compSections.length + 1;
    setCompSections([
      ...compSections,
      {
        id: crypto.randomUUID(),
        title: `${nextIdx}. Nova Seção Teórica`,
        mechanismTag: 'Mecanismo Clínico',
        content: 'Insira aqui a explicação médica detalhada ou tabela de conduta...',
        keyTakeaways: ['Conceito de alta retenção'],
        clinicalPearl: '',
        warningAlert: '',
      },
    ]);
  };

  const handleRemoveSection = (idxToRemove: number) => {
    if (compSections.length <= 1) {
      showToast('O compêndio deve possuir ao menos uma seção.');
      return;
    }
    setCompSections(compSections.filter((_, idx) => idx !== idxToRemove));
  };

  const handleUpdateSection = (idx: number, field: keyof CompendiumSection, value: any) => {
    const updated = [...compSections];
    updated[idx] = { ...updated[idx], [field]: value };
    setCompSections(updated);
  };

  const handleAddTakeaway = (secIdx: number) => {
    const updated = [...compSections];
    updated[secIdx].keyTakeaways.push('Novo ponto-chave essencial');
    setCompSections(updated);
  };

  const handleUpdateTakeaway = (secIdx: number, takeIdx: number, val: string) => {
    const updated = [...compSections];
    updated[secIdx].keyTakeaways[takeIdx] = val;
    setCompSections(updated);
  };

  const handleRemoveTakeaway = (secIdx: number, takeIdx: number) => {
    const updated = [...compSections];
    updated[secIdx].keyTakeaways = updated[secIdx].keyTakeaways.filter((_, i) => i !== takeIdx);
    setCompSections(updated);
  };

  const handleSaveCompendium = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compTitle.trim()) {
      showToast('Por favor, informe o título do compêndio.');
      return;
    }

    const tags = compTagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const dependencies = compDependenciesStr
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((title) => ({ title }));

    const references = compReferencesStr
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);

    const compId = editingCompId || crypto.randomUUID();

    const newComp: Compendium = {
      id: compId,
      disciplineId: compDisciplineId,
      themeId: compThemeId || 'geral',
      title: compTitle.trim(),
      subtitle: compSubtitle.trim(),
      moduleNumber: compModuleNumber.trim() ? Number(compModuleNumber) : undefined,
      estimatedReadTimeMinutes: Number(compEstimatedTime) || 15,
      lastUpdated: new Date().toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
      author: compAuthor.trim() || 'Equipe Editorial',
      mode: compMode,
      tags: tags.length > 0 ? tags : ['Geral', 'Medicina'],
      dependencies: dependencies.length > 0 ? dependencies : undefined,
      sections: compSections,
      references: references.length > 0 ? references : ['Diretrizes Médicas de Referência'],
    };

    await materialsRepository.saveCompendium(newComp);
    setIsCompendiumFormOpen(false);
    setEditingCompId(null);
    onRefreshData();
    showToast(editingCompId ? 'Compêndio atualizado com sucesso!' : 'Novo compêndio incluído e indexado com sucesso!');
  };

  const handleDeleteCompendium = async (id: string, title: string) => {
    if (window.confirm(`Tem certeza de que deseja excluir o compêndio "${title}"? Esta ação não pode ser desfeita.`)) {
      await materialsRepository.deleteCompendium(id);
      onRefreshData();
      showToast('Compêndio excluído.');
    }
  };

  const [bulkPublishing, setBulkPublishing] = useState(false);

  const handlePublishAllDraftCompendiums = async () => {
    const drafts = compendiums.filter((c) => c.publicationStatus !== 'published');
    if (drafts.length === 0) {
      showToast('Nenhum compêndio em rascunho.');
      return;
    }
    if (!window.confirm(`Publicar os ${drafts.length} compêndios em rascunho? Ficam visíveis para estudantes imediatamente.`)) return;
    setBulkPublishing(true);
    let ok = 0;
    for (const c of drafts) {
      try {
        await materialsRepository.publishCompendium(c.id);
        ok++;
      } catch (err) {
        console.error(`Falha ao publicar ${c.id}:`, err);
      }
    }
    setBulkPublishing(false);
    onRefreshData();
    showToast(`${ok}/${drafts.length} compêndios publicados.`);
  };

  const handlePublishAllDraftQuestions = async () => {
    const drafts = questions.filter((q) => q.publicationStatus !== 'published');
    if (drafts.length === 0) {
      showToast('Nenhuma questão em rascunho.');
      return;
    }
    if (!window.confirm(`Tentar publicar as ${drafts.length} questões em rascunho? Questões incompletas (sem 2 alternativas, sem explicação etc.) ficam de fora e são reportadas.`)) return;
    setBulkPublishing(true);
    let ok = 0;
    const failures: string[] = [];
    for (const q of drafts) {
      try {
        await questionsRepository.publishQuestion(q.id);
        ok++;
      } catch (err) {
        failures.push(`${q.questionStem.slice(0, 40)}...: ${getErrorMessage(err)}`);
      }
    }
    setBulkPublishing(false);
    onRefreshData();
    showToast(`${ok}/${drafts.length} questões publicadas.${failures.length > 0 ? ` ${failures.length} falharam (ver console).` : ''}`);
    if (failures.length > 0) console.warn('Questões não publicadas:\n' + failures.join('\n'));
  };

  const handleTogglePublishCompendium = async (id: string, title: string, currentStatus?: string) => {
    try {
      if (currentStatus === 'published') {
        await materialsRepository.unpublishCompendium(id);
        showToast(`"${title}" voltou para rascunho — estudantes não veem mais.`);
      } else {
        await materialsRepository.publishCompendium(id);
        showToast(`"${title}" publicado — visível para estudantes agora.`);
      }
      onRefreshData();
    } catch (err) {
      showToast(`Erro ao alterar publicação: ${getErrorMessage(err)}`);
    }
  };

  // ── Question Form Handlers ──────────────────────────────────────
  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQStem.trim()) return;

    const matchedComp = compendiums.find((c) => c.disciplineId === newQDiscipline);

    const question: Question = {
      id: crypto.randomUUID(),
      disciplineId: newQDiscipline,
      themeId: newQTheme || themes.find((t) => t.disciplineId === newQDiscipline)?.id || 'cardio-fa',
      compendiumRefId: matchedComp?.id || 'comp-cardio-fa',
      cycle: 'internato_residencia',
      difficulty: newQDifficulty,
      institution: newQInstitution,
      year: Number(newQYear),
      clinicalVignette: newQVignette.trim(),
      questionStem: newQStem.trim(),
      options: [
        { letter: 'A', text: optA.text, isCorrect: optA.isCorrect, explanation: optA.exp },
        { letter: 'B', text: optB.text, isCorrect: optB.isCorrect, explanation: optB.exp },
        { letter: 'C', text: optC.text, isCorrect: optC.isCorrect, explanation: optC.exp },
        { letter: 'D', text: optD.text, isCorrect: optD.isCorrect, explanation: optD.exp },
      ],
      generalCommentary: 'Comentário cadastrado via Painel Administrativo.',
      highYieldSummary: newQHighYield.trim() || 'Conceito chave adicionado pelo autor.',
      tags: ['Admin', 'CMS', 'Custom'],
    };

    await questionsRepository.saveCustomQuestion(question);
    setIsCreatingQuestion(false);
    onRefreshData();
    showToast('Questão cadastrada com sucesso e indexada no banco!');
  };

  const handleDeleteQuestion = async (id: string) => {
    if (window.confirm('Excluir esta questão permanentemente?')) {
      await questionsRepository.deleteQuestion(id);
      onRefreshData();
      showToast('Questão removida.');
    }
  };

  const handleTogglePublishQuestion = async (id: string, currentStatus?: string) => {
    try {
      if (currentStatus === 'published') {
        await questionsRepository.unpublishQuestion(id);
        showToast('Questão voltou para rascunho — estudantes não veem mais.');
      } else {
        await questionsRepository.publishQuestion(id);
        showToast('Questão publicada — visível para estudantes agora.');
      }
      onRefreshData();
    } catch (err) {
      showToast(`Não publicada: ${getErrorMessage(err)}`);
    }
  };

  const handleResetData = () => {
    if (window.confirm('Tem certeza de que deseja restaurar a base de dados original? Suas respostas e compêndios customizados serão reiniciados.')) {
      StorageService.resetToDefaults();
      onRefreshData();
      showToast('Base de dados restaurada para os padrões!');
    }
  };

  // Filtered compendiums
  const filteredCompendiums = compendiums.filter((c) => {
    if (!compSearch.trim()) return true;
    const q = compSearch.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.subtitle.toLowerCase().includes(q) ||
      c.tags?.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 dark:bg-[#142038] text-white dark:text-slate-100 px-4 py-3 rounded-xl elev-2xl border border-slate-700 dark:border-[#243452] text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3">
          <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Page Banner / Header ───────────────────────────────────── */}
      <div className="bg-white dark:bg-[#0F172A] border border-stone-200 dark:border-[#243452] rounded-2xl p-6 sm:p-8 elev-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 text-xs font-bold border border-teal-200 dark:border-teal-800/60 font-mono-code">
            <Database className="w-3.5 h-3.5" />
            <span>Painel Curatorial & CMS Editorial</span>
          </div>
          <h1 className="font-serif-reading text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 dark:text-slate-100">
            Gestão de Conteúdo Médico
          </h1>
          <p className="text-stone-600 dark:text-slate-400 text-xs sm:text-sm">
            Crie e gerencie compêndios de área, mecanismos fisiopatológicos, questões comentadas e flashcards com repetição espaçada.
          </p>
        </div>

        <button
          onClick={handleResetData}
          className="px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-[#142038] hover:bg-rose-50 hover:dark:bg-rose-950/40 text-stone-700 dark:text-slate-300 hover:text-rose-700 dark:hover:text-rose-300 border border-stone-200 dark:border-[#243452] text-xs font-semibold transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restaurar Base Padrão</span>
        </button>
      </div>

      {/* ── Navigation Tabs ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-stone-200 dark:border-[#243452] pb-3 text-xs font-bold overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('compendiums')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeTab === 'compendiums'
              ? 'bg-slate-900 text-white dark:bg-teal-600 dark:text-white elev-xs font-bold'
              : 'bg-stone-100 dark:bg-[#142038] text-stone-600 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-[#1A2845]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Compêndios & Mecanismos ({compendiums.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('questions')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeTab === 'questions'
              ? 'bg-slate-900 text-white dark:bg-teal-600 dark:text-white elev-xs font-bold'
              : 'bg-stone-100 dark:bg-[#142038] text-stone-600 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-[#1A2845]'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>Questões Comentadas ({questions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('flashcards')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeTab === 'flashcards'
              ? 'bg-slate-900 text-white dark:bg-teal-600 dark:text-white elev-xs font-bold'
              : 'bg-stone-100 dark:bg-[#142038] text-stone-600 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-[#1A2845]'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Flashcards SRS ({flashcards.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeTab === 'users'
              ? 'bg-slate-900 text-white dark:bg-teal-600 dark:text-white elev-xs font-bold'
              : 'bg-stone-100 dark:bg-[#142038] text-stone-600 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-[#1A2845]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Usuários{pendingCount > 0 ? ` (${pendingCount} pendente${pendingCount > 1 ? 's' : ''})` : ''}</span>
        </button>

        <button
          onClick={() => setActiveTab('feedback')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
            activeTab === 'feedback'
              ? 'bg-slate-900 text-white dark:bg-teal-600 dark:text-white elev-xs font-bold'
              : 'bg-stone-100 dark:bg-[#142038] text-stone-600 dark:text-slate-300 hover:bg-stone-200 dark:hover:bg-[#1A2845]'
          }`}
        >
          <MessageSquareWarning className="w-4 h-4" />
          <span>Feedback{feedbackPendingCount > 0 ? ` (${feedbackPendingCount} pendente${feedbackPendingCount > 1 ? 's' : ''})` : ''}</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── TAB: COMPENDIUMS & MECANISMOS ─────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'compendiums' && (
        <div className="space-y-6">
          {/* Top Control Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#0F172A] p-4 rounded-xl border border-stone-200 dark:border-[#243452] elev-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={compSearch}
                onChange={(e) => setCompSearch(e.target.value)}
                placeholder="Buscar por título, subtítulo ou tag..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <button
              onClick={handlePublishAllDraftCompendiums}
              disabled={bulkPublishing}
              className="px-3.5 py-2 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 hover:dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
              title="Publica todos os compêndios que ainda estão em rascunho"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Publicar rascunhos ({compendiums.filter((c) => c.publicationStatus !== 'published').length})</span>
            </button>

            <button
              onClick={handleOpenNewCompendium}
              className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:hover:bg-teal-500 text-xs font-bold transition-all flex items-center justify-center gap-1.5 elev-xs shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Compêndio / Mecanismo</span>
            </button>
          </div>

          {/* ── Section Editor (piloto CMS: histórico + reversão) ──── */}
          {editingSectionsCompId && (() => {
            const target = compendiums.find((c) => c.id === editingSectionsCompId);
            if (!target) return null;
            return (
              <SectionEditor
                compendium={target}
                onClose={() => setEditingSectionsCompId(null)}
                onSaved={onRefreshData}
              />
            );
          })()}

          {/* ── Revisão/atestação editorial (23-B) ───────────────────── */}
          {provenanceTarget && (
            <ProvenanceReviewPanel
              target={provenanceTarget.kind === 'material' ? { materialId: provenanceTarget.id } : { questionId: provenanceTarget.id }}
              title={provenanceTarget.title}
              onClose={() => setProvenanceTarget(null)}
              onChanged={onRefreshData}
            />
          )}

          {/* ── Compendium Creation/Edit Modal/Drawer Form ─────────── */}
          {isCompendiumFormOpen && (
            <form
              onSubmit={handleSaveCompendium}
              className="bg-white dark:bg-[#0F172A] rounded-2xl border-2 border-teal-500/50 dark:border-teal-500/60 p-6 sm:p-8 elev-md space-y-6 text-xs animate-in fade-in"
            >
              {/* Form Title */}
              <div className="flex items-center justify-between border-b border-stone-200 dark:border-[#243452] pb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <h3 className="font-serif-reading text-lg font-bold text-stone-900 dark:text-slate-100">
                    {editingCompId ? 'Editar Compêndio' : 'Incluir Novo Compêndio ou Mecanismo'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCompendiumFormOpen(false);
                    setEditingCompId(null);
                  }}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-slate-200 hover:bg-stone-100 dark:hover:bg-[#142038] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* General Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-titulo-principal-do-compendio-1">
                    Título Principal do Compêndio *
                  </label>
                  <input id="admincmsview-titulo-principal-do-compendio-1"
                    type="text"
                    required
                    value={compTitle}
                    onChange={(e) => setCompTitle(e.target.value)}
                    placeholder="Ex: Fibrilação Atrial: Manejo Agudo, Controle de Ritmo e Anticoagulação"
                    className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100 font-semibold text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-modalidade-categoria-2">
                    Modalidade / Categoria
                  </label>
                  <select id="admincmsview-modalidade-categoria-2"
                    value={compMode}
                    onChange={(e) => setCompMode(e.target.value as 'atlas' | 'mecanismos')}
                    className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100 font-semibold text-xs"
                  >
                    <option value="mecanismos">Mecanismo Fisiopatológico (Fisio/Farmaco)</option>
                    <option value="atlas">Compêndio de Área (Atlas / Panorama)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-subtitulo-descricao-sintetica-3">
                  Subtítulo / Descrição Sintética *
                </label>
                <input id="admincmsview-subtitulo-descricao-sintetica-3"
                  type="text"
                  required
                  value={compSubtitle}
                  onChange={(e) => setCompSubtitle(e.target.value)}
                  placeholder="Ex: Abordagem fisiopatológica do remodelamento atrial, escores CHA2DS2-VASc e condutas baseadas em diretrizes."
                  className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-disciplina-4">
                    Disciplina
                  </label>
                  <select id="admincmsview-disciplina-4"
                    value={compDisciplineId}
                    onChange={(e) => setCompDisciplineId(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100 text-xs"
                  >
                    {disciplines.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-tema-vinculado-5">
                    Tema Vinculado
                  </label>
                  <select id="admincmsview-tema-vinculado-5"
                    value={compThemeId}
                    onChange={(e) => setCompThemeId(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100 text-xs"
                  >
                    {themes
                      .filter((t) => !compDisciplineId || t.disciplineId === compDisciplineId)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    <option value="custom-geral">Geral / Teoria Integrada</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-autor-curador-6">
                    Autor / Curador
                  </label>
                  <input id="admincmsview-autor-curador-6"
                    type="text"
                    value={compAuthor}
                    onChange={(e) => setCompAuthor(e.target.value)}
                    placeholder="Ex: Dr. Roberto Albuquerque"
                    className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100 text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-tempo-est-minutos-7">
                    Tempo Est. (minutos)
                  </label>
                  <input id="admincmsview-tempo-est-minutos-7"
                    type="number"
                    min={1}
                    max={120}
                    value={compEstimatedTime}
                    onChange={(e) => setCompEstimatedTime(Number(e.target.value))}
                    className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100 text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-nº-do-modulo-opcional-8">
                    Nº do módulo (opcional)
                  </label>
                  <input id="admincmsview-nº-do-modulo-opcional-8"
                    type="number"
                    min={1}
                    value={compModuleNumber}
                    onChange={(e) => setCompModuleNumber(e.target.value)}
                    placeholder="Ex: 7 — só se o material pertence a um currículo numerado"
                    className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-tags-clinicas-separadas-por-9">
                    Tags Clínicas (separadas por vírgula)
                  </label>
                  <input id="admincmsview-tags-clinicas-separadas-por-9"
                    type="text"
                    value={compTagsStr}
                    onChange={(e) => setCompTagsStr(e.target.value)}
                    placeholder="Ex: Cardiologia, Eletrofisiologia, Anticoagulação, Emergência"
                    className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100 text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-nos-de-conexao-pre-requisitos-10">
                    Nós de Conexão / Pré-requisitos (separados por vírgula)
                  </label>
                  <input id="admincmsview-nos-de-conexao-pre-requisitos-10"
                    type="text"
                    value={compDependenciesStr}
                    onChange={(e) => setCompDependenciesStr(e.target.value)}
                    placeholder="Ex: Potencial de Ação Cardíaco, Anatomia dos Átrios"
                    className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100 text-xs"
                  />
                </div>
              </div>

              {/* ── SECTIONS BUILDER ───────────────────────────────────── */}
              <div className="space-y-4 pt-4 border-t border-stone-200 dark:border-[#243452]">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-stone-900 dark:text-slate-100 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <span>Seções Teóricas Estruturadas ({compSections.length})</span>
                    </h4>
                    <p className="text-[11px] text-stone-500 dark:text-slate-400">
                      Adicione módulos explicativos, tabelas markdown, pontos-chave e alertas clínicos.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddSection}
                    className="px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-[#142038] hover:bg-stone-200 dark:hover:bg-[#1A2845] text-stone-800 dark:text-stone-200 font-bold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>Adicionar Seção</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {compSections.map((sec, secIdx) => (
                    <div
                      key={sec.id || secIdx}
                      className="p-4 sm:p-5 rounded-xl bg-stone-50 dark:bg-[#142038] border border-stone-200 dark:border-[#243452] space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-stone-200 dark:border-[#243452]/60 pb-2">
                        <span className="font-mono-code text-[11px] font-bold text-amber-900 dark:text-teal-400">
                          Seção {secIdx + 1}
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveSection(secIdx)}
                            className="text-stone-400 hover:text-rose-600 transition-colors p-1"
                            title="Remover Seção"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-titulo-da-secao-11">
                            Título da Seção
                          </label>
                          <input id="admincmsview-titulo-da-secao-11"
                            type="text"
                            required
                            value={sec.title}
                            onChange={(e) => handleUpdateSection(secIdx, 'title', e.target.value)}
                            placeholder="Ex: 1. Fisiopatologia e Remodelamento Eletroanatômico"
                            className="w-full p-2 rounded-lg border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0F172A] text-stone-900 dark:text-slate-100 text-xs font-semibold"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-tag-de-mecanismo-ancora-12">
                            Tag de Mecanismo / Âncora
                          </label>
                          <input id="admincmsview-tag-de-mecanismo-ancora-12"
                            type="text"
                            value={sec.mechanismTag || ''}
                            onChange={(e) => handleUpdateSection(secIdx, 'mechanismTag', e.target.value)}
                            placeholder="Ex: Fisiopatologia, Farmacodinâmica, Conduta"
                            className="w-full p-2 rounded-lg border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0F172A] text-stone-900 dark:text-slate-100 text-xs"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-conteudo-teorico-markdown-texto-13">
                          Conteúdo Teórico (Markdown / Texto / Tabelas)
                        </label>
                        <textarea id="admincmsview-conteudo-teorico-markdown-texto-13"
                          rows={4}
                          required
                          value={sec.content}
                          onChange={(e) => handleUpdateSection(secIdx, 'content', e.target.value)}
                          placeholder="Digite os conceitos. Para tabelas, utilize o formato | Coluna 1 | Coluna 2 |"
                          className="w-full p-3 rounded-lg border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0F172A] text-stone-900 dark:text-slate-100 font-mono-code text-xs leading-relaxed"
                        />
                      </div>

                      {/* Key Takeaways Builder */}
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between">
                          {/* Rótulo de uma lista dinâmica (não de um único controle
                              nativo) — `span`, não `label`, para não disparar falso
                              positivo de jsx-a11y/label-has-associated-control. */}
                          <span className="font-bold text-stone-700 dark:text-slate-300 block">
                            Pontos-Chave & Mecanismos Essenciais
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddTakeaway(secIdx)}
                            className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline font-semibold"
                          >
                            + Ponto-chave
                          </button>
                        </div>
                        {sec.keyTakeaways.map((takeaway, tIdx) => (
                          <div key={tIdx} className="flex items-center gap-2">
                            <span className="text-teal-600 dark:text-teal-400 font-bold">•</span>
                            <input
                              type="text"
                              value={takeaway}
                              onChange={(e) => handleUpdateTakeaway(secIdx, tIdx, e.target.value)}
                              placeholder="Conceito chave para fixação"
                              className="flex-1 p-1.5 rounded-md border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0F172A] text-stone-900 dark:text-slate-100 text-xs"
                            />
                            {sec.keyTakeaways.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveTakeaway(secIdx, tIdx)}
                                className="text-stone-400 hover:text-rose-500 p-1"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="font-bold text-stone-700 dark:text-slate-300 flex items-center gap-1 mb-1" htmlFor="admincmsview-perola-clinica-aplicacao-opcional-14">
                            <Lightbulb className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                            <span>Pérola Clínica & Aplicação (Opcional)</span>
                          </label>
                          <input id="admincmsview-perola-clinica-aplicacao-opcional-14"
                            type="text"
                            value={sec.clinicalPearl || ''}
                            onChange={(e) => handleUpdateSection(secIdx, 'clinicalPearl', e.target.value)}
                            placeholder="Dica rápida de conduta ou diagnóstico"
                            className="w-full p-2 rounded-lg border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0F172A] text-stone-900 dark:text-slate-100 text-xs"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-stone-700 dark:text-slate-300 flex items-center gap-1 mb-1" htmlFor="admincmsview-alerta-de-armadilha-erro-15">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                            <span>Alerta de Armadilha / Erro Comum (Opcional)</span>
                          </label>
                          <input id="admincmsview-alerta-de-armadilha-erro-15"
                            type="text"
                            value={sec.warningAlert || ''}
                            onChange={(e) => handleUpdateSection(secIdx, 'warningAlert', e.target.value)}
                            placeholder="Contraindicação ou pegadinha clássica"
                            className="w-full p-2 rounded-lg border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0F172A] text-stone-900 dark:text-slate-100 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* References */}
              <div>
                <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-referencias-bibliograficas-diretrizes-oficiais-16">
                  Referências Bibliográficas & Diretrizes Oficiais (uma por linha)
                </label>
                <textarea id="admincmsview-referencias-bibliograficas-diretrizes-oficiais-16"
                  rows={2}
                  value={compReferencesStr}
                  onChange={(e) => setCompReferencesStr(e.target.value)}
                  placeholder="Ex: Diretriz de Fibrilação Atrial da Sociedade Brasileira de Cardiologia (2024)"
                  className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100 text-xs"
                />
              </div>

              {/* Form Buttons */}
              <div className="pt-4 border-t border-stone-200 dark:border-[#243452] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCompendiumFormOpen(false);
                    setEditingCompId(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-stone-200 dark:border-[#243452] text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#1A2845] font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:text-white dark:hover:bg-teal-500 font-bold elev-xs flex items-center gap-1.5 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingCompId ? 'Atualizar Compêndio' : 'Publicar Compêndio'}</span>
                </button>
              </div>
            </form>
          )}

          {/* ── Compendiums List Grid ────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCompendiums.map((c) => {
              const isAtlas = c.mode !== 'mecanismos';
              const disc = disciplines.find((d) => d.id === c.disciplineId);

              return (
                <div
                  key={c.id}
                  data-compendium-row-id={c.id}
                  className={`bg-white dark:bg-[#0F172A] rounded-xl border border-stone-200 dark:border-[#243452] p-5 elev-xs flex flex-col justify-between space-y-4 hover:border-amber-400 dark:hover:border-teal-500 transition-all ${
                    isAtlas ? 'border-l-4 border-l-[#5b8dd9]' : 'border-l-4 border-l-[#c0604a]'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            isAtlas ? 'badge-atlas' : 'badge-mec'
                          }`}
                        >
                          {isAtlas ? 'Compêndio de Área' : 'Mecanismo Fisiopatológico'}
                        </span>
                        <span className="text-[10px] font-semibold text-stone-500 dark:text-slate-400">
                          {disc?.name || c.disciplineId}
                        </span>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded font-bold border ${
                            c.publicationStatus === 'published'
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
                          }`}
                        >
                          {c.publicationStatus === 'published' ? 'publicado' : 'rascunho'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-stone-400 font-mono-code">
                        <Clock className="w-3 h-3" />
                        <span>{c.estimatedReadTimeMinutes} min</span>
                      </div>
                    </div>

                    <h4 className="font-serif-reading text-base font-bold text-stone-900 dark:text-slate-100 leading-snug">
                      {c.title}
                    </h4>
                    <p className="text-xs text-stone-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {c.subtitle}
                    </p>

                    <div className="flex items-center gap-2 text-[11px] text-stone-500 dark:text-slate-400 pt-1">
                      <span>{c.sections.length} {c.sections.length === 1 ? 'seção' : 'seções'} estruturadas</span>
                      <span>·</span>
                      <span>Autor: {c.author}</span>
                    </div>

                    {c.tags && c.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {c.tags.map((t, idx) => (
                          <span
                            key={idx}
                            className="text-[9px] px-2 py-0.5 rounded bg-stone-100 dark:bg-[#142038] text-stone-600 dark:text-slate-400 border border-stone-200 dark:border-[#243452]"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-stone-100 dark:border-[#243452] flex items-center justify-between">
                    <span className="text-[10px] text-stone-400 font-mono-code">ID: {c.id}</span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setProvenanceTarget({ kind: 'material', id: c.id, title: c.title })}
                        className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-[#243452] hover:bg-stone-100 dark:hover:bg-[#1A2845] text-stone-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-1 transition-colors"
                        title="Revisão/atestação editorial — obrigatória para publicar (23-B)"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Revisão</span>
                      </button>
                      <button
                        onClick={() => handleTogglePublishCompendium(c.id, c.title, c.publicationStatus)}
                        className={`px-3 py-1.5 rounded-lg border font-semibold text-xs flex items-center gap-1 transition-colors ${
                          c.publicationStatus === 'published'
                            ? 'border-stone-200 dark:border-[#243452] hover:bg-stone-100 dark:hover:bg-[#1A2845] text-stone-600 dark:text-stone-300'
                            : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 hover:dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                        }`}
                        title={c.publicationStatus === 'published' ? 'Despublicar (volta a rascunho)' : 'Publicar (fica visível para estudantes)'}
                      >
                        {c.publicationStatus === 'published' ? (
                          <>
                            <ShieldBan className="w-3.5 h-3.5" />
                            <span>Despublicar</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Publicar</span>
                          </>
                        )}
                      </button>

                      <div className="relative">
                        <button
                          onClick={() => setOpenEditMenuCompId(openEditMenuCompId === c.id ? null : c.id)}
                          className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-[#243452] hover:bg-stone-100 dark:hover:bg-[#1A2845] text-stone-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-1 transition-colors"
                          title="Editar"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                          <span>Editar</span>
                          <ChevronDown className="w-3 h-3" />
                        </button>

                        {openEditMenuCompId === c.id && (
                          <>
                            {/* Overlay transparente para fechar o menu ao clicar fora */}
                            <div className="fixed inset-0 z-10" onClick={() => setOpenEditMenuCompId(null)} />
                            <div className="absolute right-0 mt-1 w-56 rounded-lg border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0F172A] elev-md z-20 overflow-hidden">
                              <button
                                onClick={() => {
                                  setEditingSectionsCompId(c.id);
                                  setOpenEditMenuCompId(null);
                                }}
                                className="w-full text-left px-3 py-2.5 hover:bg-stone-100 dark:hover:bg-[#1A2845] text-stone-700 dark:text-slate-300 text-xs flex items-center gap-2 transition-colors"
                              >
                                <Layers className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                <span>
                                  <span className="block font-semibold">Conteúdo</span>
                                  <span className="block text-[10px] text-stone-400">Texto das seções, com histórico e reversão</span>
                                </span>
                              </button>
                              <button
                                onClick={() => {
                                  handleEditCompendium(c);
                                  setOpenEditMenuCompId(null);
                                }}
                                className="w-full text-left px-3 py-2.5 hover:bg-stone-100 dark:hover:bg-[#1A2845] text-stone-700 dark:text-slate-300 text-xs flex items-center gap-2 transition-colors border-t border-stone-100 dark:border-[#243452]"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                <span>
                                  <span className="block font-semibold">Metadados</span>
                                  <span className="block text-[10px] text-stone-400">Título, disciplina, tags, autor...</span>
                                </span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      <button
                        onClick={() => handleDeleteCompendium(c.id, c.title)}
                        className="p-1.5 rounded-lg border border-stone-200 dark:border-[#243452] hover:bg-rose-50 hover:dark:bg-rose-950/40 text-stone-400 hover:text-rose-600 transition-colors"
                        title="Excluir compêndio"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── TAB: QUESTIONS MANAGEMENT ─────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'questions' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white dark:bg-[#0F172A] p-4 rounded-xl border border-stone-200 dark:border-[#243452] elev-xs">
            <div>
              <h3 className="font-serif-reading text-base font-bold text-stone-900 dark:text-slate-100">
                Banco de Questões Cadastradas
              </h3>
              <p className="text-[11px] text-stone-500 dark:text-slate-400">
                {questions.length} questões com explicações por alternativa vinculadas aos compêndios
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handlePublishAllDraftQuestions}
                disabled={bulkPublishing}
                className="px-3.5 py-2 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 hover:dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                title="Tenta publicar todas as questões em rascunho; incompletas ficam de fora"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Publicar rascunhos ({questions.filter((q) => q.publicationStatus !== 'published').length})</span>
              </button>

              <button
                onClick={() => setIsCreatingQuestion(!isCreatingQuestion)}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:text-white dark:hover:bg-teal-500 font-bold text-xs rounded-lg elev-xs transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{isCreatingQuestion ? 'Fechar Formulário' : 'Nova Questão'}</span>
              </button>
            </div>
          </div>

          {/* Creation Form */}
          {isCreatingQuestion && (
            <form
              onSubmit={handleSaveQuestion}
              className="bg-white dark:bg-[#0F172A] rounded-2xl border-2 border-amber-500/50 dark:border-teal-500/60 p-6 elev-sm space-y-4 text-xs animate-in fade-in"
            >
              <h4 className="font-serif-reading font-bold text-sm text-stone-900 dark:text-slate-100 pb-2 border-b border-stone-200 dark:border-[#243452]">
                Cadastrar Questão com Explicação por Alternativa
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-disciplina-17">Disciplina</label>
                  <select id="admincmsview-disciplina-17"
                    value={newQDiscipline}
                    onChange={(e) => setNewQDiscipline(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100"
                  >
                    {disciplines.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-instituicao-banca-18">Instituição / Banca</label>
                  <input id="admincmsview-instituicao-banca-18"
                    type="text"
                    required
                    value={newQInstitution}
                    onChange={(e) => setNewQInstitution(e.target.value)}
                    placeholder="Ex: USP, ENARE, UNICAMP"
                    className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-ano-19">Ano</label>
                  <input id="admincmsview-ano-19"
                    type="number"
                    required
                    value={newQYear}
                    onChange={(e) => setNewQYear(Number(e.target.value))}
                    className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-enunciado-clinico-caso-vinheta-20">
                  Enunciado Clínico (Caso / Vinheta)
                </label>
                <textarea id="admincmsview-enunciado-clinico-caso-vinheta-20"
                  rows={2}
                  value={newQVignette}
                  onChange={(e) => setNewQVignette(e.target.value)}
                  placeholder="Ex: Paciente de 68 anos dá entrada no pronto-socorro com palpitações taquicárdicas..."
                  className="w-full p-3 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-comando-da-questao-pergunta-21">
                  Comando da Questão (Pergunta)
                </label>
                <input id="admincmsview-comando-da-questao-pergunta-21"
                  type="text"
                  required
                  value={newQStem}
                  onChange={(e) => setNewQStem(e.target.value)}
                  placeholder="Ex: Qual é a conduta farmacológica imediata mais indicada?"
                  className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100"
                />
              </div>

              {/* Alternatives */}
              <div className="space-y-3 pt-2">
                <span className="font-bold text-stone-800 dark:text-stone-200 block">
                  Alternativas e Explicações Individuais:
                </span>

                {[
                  { letter: 'A', state: optA, set: setOptA },
                  { letter: 'B', state: optB, set: setOptB },
                  { letter: 'C', state: optC, set: setOptC },
                  { letter: 'D', state: optD, set: setOptD },
                ].map((item) => (
                  <div
                    key={item.letter}
                    className="p-3 bg-stone-50 dark:bg-[#142038] rounded-xl border border-stone-200 dark:border-[#243452] space-y-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-stone-700 dark:text-slate-300 font-mono-code">
                        {item.letter})
                      </span>
                      <input
                        type="text"
                        required
                        placeholder={`Texto da alternativa ${item.letter}`}
                        value={item.state.text}
                        onChange={(e) => item.set({ ...item.state, text: e.target.value })}
                        className="flex-1 p-2 rounded-lg border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0F172A] text-stone-900 dark:text-slate-100"
                      />
                      <label className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-400 cursor-pointer">
                        <input
                          type="radio"
                          name="correctOpt"
                          checked={item.state.isCorrect}
                          onChange={() => {
                            setOptA({ ...optA, isCorrect: item.letter === 'A' });
                            setOptB({ ...optB, isCorrect: item.letter === 'B' });
                            setOptC({ ...optC, isCorrect: item.letter === 'C' });
                            setOptD({ ...optD, isCorrect: item.letter === 'D' });
                          }}
                        />
                        <span>Gabarito</span>
                      </label>
                    </div>
                    <input
                      type="text"
                      placeholder={`Explicação comentada da alternativa ${item.letter}`}
                      value={item.state.exp}
                      onChange={(e) => item.set({ ...item.state, exp: e.target.value })}
                      className="w-full p-2 rounded-lg border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0F172A] text-stone-900 dark:text-slate-100"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="font-bold text-stone-700 dark:text-slate-300 block mb-1" htmlFor="admincmsview-perola-high-yield-resumo-para-22">
                  Pérola High-Yield (Resumo para fixação rápida)
                </label>
                <input id="admincmsview-perola-high-yield-resumo-para-22"
                  type="text"
                  value={newQHighYield}
                  onChange={(e) => setNewQHighYield(e.target.value)}
                  placeholder="Ex: Em pacientes instáveis, a conduta é cardioversão elétrica imediata sincronizada."
                  className="w-full p-2.5 rounded-lg border border-stone-200 dark:border-[#243452] bg-stone-50 dark:bg-[#142038] text-stone-900 dark:text-slate-100"
                />
              </div>

              <div className="pt-3 border-t border-stone-200 dark:border-[#243452] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreatingQuestion(false)}
                  className="px-4 py-2 rounded-lg text-stone-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-[#1A2845] font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white dark:bg-teal-600 dark:text-white dark:hover:bg-teal-500 font-bold elev-xs flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Publicar Questão</span>
                </button>
              </div>
            </form>
          )}

          {/* List of existing questions */}
          <div className="bg-white dark:bg-[#0F172A] rounded-xl border border-stone-200 dark:border-[#243452] divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden elev-xs">
            {questions.map((q) => (
              <div
                key={q.id}
                id={`admin-question-${q.id}`}
                className={`p-4 flex items-center justify-between gap-4 text-xs transition-colors ${
                  highlightedQuestionId === q.id ? 'bg-teal-50 dark:bg-teal-950/30' : ''
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-900 dark:text-slate-100">
                      {q.institution} ({q.year})
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-stone-100 dark:bg-[#142038] text-stone-600 dark:text-slate-400 font-semibold">
                      {q.difficulty}
                    </span>
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded font-bold border ${
                        q.publicationStatus === 'published'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                          : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
                      }`}
                    >
                      {q.publicationStatus === 'published' ? 'publicada' : 'rascunho'}
                    </span>
                    {(reactionCounts[q.id]?.up || reactionCounts[q.id]?.down) ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-stone-100 dark:bg-[#142038] text-stone-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                        <span className="flex items-center gap-0.5"><ThumbsUp className="w-3 h-3" />{reactionCounts[q.id]?.up || 0}</span>
                        <span className="flex items-center gap-0.5"><ThumbsDown className="w-3 h-3" />{reactionCounts[q.id]?.down || 0}</span>
                      </span>
                    ) : null}
                  </div>
                  <p className="text-stone-600 dark:text-slate-400 font-medium line-clamp-1">{q.questionStem}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-stone-400 text-[11px]">{q.options.length} alternativas</span>
                  <button
                    onClick={() => setProvenanceTarget({ kind: 'question', id: q.id, title: q.questionStem.slice(0, 60) })}
                    className="px-2.5 py-1 rounded-lg border border-stone-200 dark:border-[#243452] hover:bg-stone-100 dark:hover:bg-[#1A2845] text-stone-600 dark:text-stone-300 font-semibold flex items-center gap-1 transition-colors"
                    title="Revisão/atestação editorial — obrigatória para publicar (23-B)"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Revisão</span>
                  </button>
                  <button
                    onClick={() => handleTogglePublishQuestion(q.id, q.publicationStatus)}
                    className={`px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1 transition-colors ${
                      q.publicationStatus === 'published'
                        ? 'border-stone-200 dark:border-[#243452] hover:bg-stone-100 dark:hover:bg-[#1A2845] text-stone-600 dark:text-stone-300'
                        : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 hover:dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                    }`}
                    title={q.publicationStatus === 'published' ? 'Despublicar (volta a rascunho)' : 'Publicar (fica visível para estudantes)'}
                  >
                    {q.publicationStatus === 'published' ? (
                      <ShieldBan className="w-3.5 h-3.5" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    )}
                    <span>{q.publicationStatus === 'published' ? 'Despublicar' : 'Publicar'}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteQuestion(q.id)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 transition-colors"
                    title="Excluir questão"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── TAB: FLASHCARDS SRS ───────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'flashcards' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#0F172A] p-4 rounded-xl border border-stone-200 dark:border-[#243452] elev-xs flex items-center justify-between">
            <div>
              <h3 className="font-serif-reading text-base font-bold text-stone-900 dark:text-slate-100">
                Flashcards SRS no Sistema
              </h3>
              <p className="text-[11px] text-stone-500 dark:text-slate-400">
                Cartões indexados para repetição espaçada SM-2 vinculados à base conceitual
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-[#0F172A] rounded-xl border border-stone-200 dark:border-[#243452] divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden elev-xs">
            {flashcards.map((fc) => (
              <div key={fc.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                <div className="space-y-1">
                  <span className="font-bold text-stone-900 dark:text-slate-100">{fc.front}</span>
                  <p className="text-stone-500 dark:text-slate-400 line-clamp-1">{fc.back}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 dark:bg-teal-950/60 text-amber-900 dark:text-teal-400 font-bold border border-amber-200 dark:border-teal-500/40">
                    Repetições: {fc.srs.repetitionCount}
                  </span>
                  <button
                    onClick={async () => {
                      await flashcardsRepository.deleteFlashcard(fc.id);
                      onRefreshData();
                      showToast('Flashcard removido.');
                    }}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 transition-colors"
                    title="Excluir flashcard"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── TAB: USUÁRIOS & APROVAÇÃO ─────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#0F172A] p-4 rounded-xl border border-stone-200 dark:border-[#243452] elev-xs flex items-center justify-between">
            <div>
              <h3 className="font-serif-reading text-base font-bold text-stone-900 dark:text-slate-100">
                Cadastros e Aprovação de Acesso
              </h3>
              <p className="text-[11px] text-stone-500 dark:text-slate-400">
                Novas contas nascem como "pendente" e só acessam o conteúdo depois de aprovadas aqui.
              </p>
            </div>
            <button
              onClick={loadProfiles}
              disabled={profilesLoading}
              className="px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-[#142038] hover:bg-stone-200 hover:dark:bg-stone-700 text-stone-700 dark:text-slate-300 border border-stone-200 dark:border-[#243452] text-xs font-semibold transition-colors flex items-center gap-2 shrink-0 disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${profilesLoading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>

          {profilesError && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl p-4 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Erro ao carregar usuários: {profilesError}</span>
            </div>
          )}

          <div className="bg-white dark:bg-[#0F172A] rounded-xl border border-stone-200 dark:border-[#243452] divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden elev-xs">
            {profilesLoading && profiles.length === 0 && (
              <div className="p-6 text-center text-xs text-stone-500 dark:text-slate-400">Carregando usuários…</div>
            )}
            {!profilesLoading && profiles.length === 0 && !profilesError && (
              <div className="p-6 text-center text-xs text-stone-500 dark:text-slate-400">Nenhum usuário cadastrado ainda.</div>
            )}
            {profiles.map((p) => (
              <div key={p.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-900 dark:text-slate-100 truncate">
                      {p.display_name || p.email}
                    </span>
                    {p.role === 'admin' && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 dark:bg-teal-950/60 text-amber-900 dark:text-teal-400 font-bold border border-amber-200 dark:border-teal-500/40 shrink-0">
                        admin
                      </span>
                    )}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold border shrink-0 ${
                        p.status === 'active'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                          : p.status === 'pending'
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
                          : 'bg-stone-100 dark:bg-[#142038] text-stone-500 dark:text-slate-400 border-stone-200 dark:border-[#243452]'
                      }`}
                    >
                      {p.status === 'active' ? 'ativo' : p.status === 'pending' ? 'pendente' : 'bloqueado'}
                    </span>
                  </div>
                  <p className="text-stone-500 dark:text-slate-400 truncate">{p.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.status !== 'active' && (
                    <button
                      onClick={() => handleSetProfileStatus(p, 'active')}
                      disabled={updatingProfileId === p.id}
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 hover:dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Aprovar</span>
                    </button>
                  )}
                  {p.status !== 'blocked' && p.role !== 'admin' && (
                    <button
                      onClick={() => handleSetProfileStatus(p, 'blocked')}
                      disabled={updatingProfileId === p.id}
                      className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 hover:dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <ShieldBan className="w-3.5 h-3.5" />
                      <span>Bloquear</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── TAB: FEEDBACK ──────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'feedback' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#0F172A] p-4 rounded-xl border border-stone-200 dark:border-[#243452] elev-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-serif-reading text-base font-bold text-stone-900 dark:text-slate-100">
                Feedback dos Participantes
              </h3>
              <p className="text-[11px] text-stone-500 dark:text-slate-400">
                Relatos de problemas, erros de gabarito e sugestões enviados pelos estudantes.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#142038] rounded-xl border border-stone-200 dark:border-[#243452]">
                <button
                  type="button"
                  onClick={() => setFeedbackFilter('todos')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    feedbackFilter === 'todos'
                      ? 'bg-white dark:bg-[#0F172A] text-stone-900 dark:text-slate-100 shadow-2xs'
                      : 'text-stone-500 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200'
                  }`}
                >
                  Todos ({feedbackList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackFilter('pendentes')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    feedbackFilter === 'pendentes'
                      ? 'bg-white dark:bg-[#0F172A] text-amber-700 dark:text-amber-300 shadow-2xs'
                      : 'text-stone-500 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200'
                  }`}
                >
                  Pendentes ({feedbackPendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackFilter('resolvidos')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    feedbackFilter === 'resolvidos'
                      ? 'bg-white dark:bg-[#0F172A] text-emerald-700 dark:text-emerald-300 shadow-2xs'
                      : 'text-stone-500 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200'
                  }`}
                >
                  Resolvidos ({feedbackList.filter((f) => f.status === 'resolvido').length})
                </button>
              </div>

              <button
                onClick={loadFeedback}
                disabled={feedbackLoading}
                className="px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-[#142038] hover:bg-stone-200 hover:dark:bg-stone-700 text-stone-700 dark:text-slate-300 border border-stone-200 dark:border-[#243452] text-xs font-semibold transition-colors flex items-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${feedbackLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>
          </div>

          {feedbackError && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl p-4 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Erro ao carregar feedback: {feedbackError}</span>
            </div>
          )}

          <div className="bg-white dark:bg-[#0F172A] rounded-xl border border-stone-200 dark:border-[#243452] divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden elev-xs">
            {feedbackLoading && feedbackList.length === 0 && (
              <div className="p-6 text-center text-xs text-stone-500 dark:text-slate-400">Carregando feedback…</div>
            )}
            {!feedbackLoading && feedbackList.length === 0 && !feedbackError && (
              <div className="p-6 text-center text-xs text-stone-500 dark:text-slate-400">Nenhum feedback recebido ainda.</div>
            )}
            {feedbackList
              .filter((f) => {
                if (feedbackFilter === 'pendentes') return f.status !== 'resolvido';
                if (feedbackFilter === 'resolvidos') return f.status === 'resolvido';
                return true;
              })
              .map((f) => (
              <div key={f.id} className="p-4 space-y-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded font-bold border uppercase tracking-wider ${
                      f.type === 'problema'
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900'
                        : f.type === 'sugestao'
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                    }`}
                  >
                    {f.type}
                  </span>
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded font-bold border uppercase tracking-wider ${
                      f.status === 'resolvido'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
                    }`}
                  >
                    {f.status === 'resolvido' ? 'Resolvido' : 'Pendente'}
                  </span>
                  <span className="font-bold text-stone-900 dark:text-slate-100">{f.title}</span>
                  {(f.questionId || f.materialId) && (
                    <button
                      onClick={() => handleOpenFeedbackTarget(f)}
                      className="text-[11px] text-teal-700 dark:text-teal-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>{f.questionId ? 'Ver questão' : 'Ver compêndio'}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-stone-600 dark:text-slate-400 leading-relaxed">{f.description}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-stone-400">
                    {f.userEmail || 'e-mail não disponível'} · {new Date(f.createdAt).toLocaleString('pt-BR')}
                  </span>
                  {f.status !== 'resolvido' ? (
                    <button
                      onClick={() => handleResolveFeedback(f)}
                      disabled={updatingFeedbackId === f.id}
                      className="px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 hover:dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Marcar como Resolvido</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Resolvido</span>
                      </span>
                      <button
                        onClick={() => handleReopenFeedback(f)}
                        disabled={updatingFeedbackId === f.id}
                        className="text-[10px] text-stone-400 hover:text-stone-600 dark:hover:text-slate-300 underline cursor-pointer disabled:opacity-50"
                      >
                        Reabrir
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
