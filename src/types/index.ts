export type UserPlan = 'free' | 'premium';

export type UserRole = 'student' | 'admin';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  plan: UserPlan;
  status?: 'active' | 'pending' | 'blocked';
  createdAt?: string;
  lastLoginAt?: string;
}

export interface MigrationSummary {
  hasLegacyData: boolean;
  answersCount: number;
  flashcardsCount: number;
  simuladosCount: number;
  bookmarksCount: number;
  notesCount: number;
  readingProgressCount: number;
}

export type ThemeMode = 'light' | 'dark';

export type MedicalCycle = 'basico' | 'clinico' | 'internato_residencia';

export type DifficultyLevel = 'facil' | 'medio' | 'dificil';

export interface Discipline {
  id: string;
  name: string;
  code: string;
  icon: string;
  description: string;
  cycle: MedicalCycle;
  color: string;
  themesCount?: number;
}

export interface Theme {
  id: string;
  disciplineId: string;
  name: string;
  description: string;
  highYield: boolean;
  order: number;
}

export interface CompendiumSection {
  id: string;
  title: string;
  mechanismTag?: string; // e.g. "Fisiopatologia", "Farmacodinâmica", "Critérios Diagnósticos", "Conduta", "Pérolas Clínicas"
  content: string; // Markdown / structured medical text
  keyTakeaways: string[];
  clinicalPearl?: string;
  warningAlert?: string;
  examConsensus?: string;
  diagramSvgKey?: string;
}

/** Campos de CompendiumSection que entram no snapshot de histórico (prosa editável). */
export interface CompendiumSectionSnapshot {
  title: string;
  mechanismTag?: string;
  content: string;
  keyTakeaways: string[];
  clinicalPearl?: string;
  warningAlert?: string;
  examConsensus?: string;
}

/** Snapshot completo de uma seção de compêndio, gravado a cada edição via CMS. */
export interface MaterialSectionVersion {
  id: string;
  materialSectionId: string;
  changedBy: string | null;
  changedFields: string[];
  reason: string | null;
  beforeSnapshot: CompendiumSectionSnapshot;
  afterSnapshot: CompendiumSectionSnapshot;
  createdAt: string;
}

export type StudyLens =
  | 'fisiopatologia'
  | 'diagnostico'
  | 'conduta'
  | 'farmacologia'
  | 'alto_rendimento';

export type EditorialStatus = 'completo' | 'em_atualizacao' | 'em_revisao';

/** Nível do nó na árvore editorial — ver docs/operacao/standards/taxonomia-materiais.md. */
export type TaxonomyKind = 'visao_geral' | 'mecanismo' | 'classe' | 'subclasse' | 'farmaco' | 'condicao';

/**
 * Ligação transversal entre dois materiais na árvore (material_links).
 * `materialId` é sempre o OUTRO lado do vínculo, nunca o próprio material —
 * ver app.build_material_snapshot no banco, mesma convenção.
 */
export interface MaterialNavigationLink {
  materialId: string;
  linkType: 'prerequisite' | 'related';
  sortOrder: number;
}

export interface Compendium {
  id: string;
  disciplineId: string;
  themeId: string;
  title: string;
  subtitle: string;
  /** Número de módulo do currículo de origem (ex. "M7"), quando aplicável — nem todo material tem. */
  moduleNumber?: number;
  estimatedReadTimeMinutes: number;
  lastUpdated: string;
  author: string;
  mode?: 'atlas' | 'mecanismos';
  studyLens?: StudyLens;
  editorialStatus?: EditorialStatus;
  /** Controla visibilidade para estudantes via RLS (materials.status). Distinto de editorialStatus. */
  publicationStatus?: 'draft' | 'published' | 'archived';
  tags?: string[];
  dependencies?: { title: string; linkId?: string }[];
  /** Material-pai na árvore de navegação. Ausente/null = raiz. Mesma disciplina exigida pelo banco. */
  parentMaterialId?: string | null;
  /** Ordem entre irmãos (mesmo parentMaterialId). Convenção: passos de 10. */
  treeSortOrder?: number;
  /** Rótulo curto de trilha/cartão (até 40 caracteres). Ausente = usar `title`. */
  navShortTitle?: string;
  taxonomyKind?: TaxonomyKind;
  /** Vínculos `Estude antes`/`Veja também`. Ausente na leitura = nunca carregado; ausente na gravação = não altera (ver save_compendium). */
  navigationLinks?: MaterialNavigationLink[];
  sections: CompendiumSection[];
  references: string[];
  /**
   * Vínculo estruturado de cada item de `references` a uma fonte curada
   * (material_references.source_id -> sources), quando existir. Mesmo
   * índice de `references` (`referenceSources[i]` descreve `references[i]`);
   * ausente ou `linked: false` quando o item é só bibliografia geral em
   * texto livre (hoje o caso dos 33 compêndios carregados — nenhum tem
   * source_id curado, ver AGENTS.md/relatório de auditoria 2026-09-07).
   * `url` só aparece quando a fonte tem identificador verificável
   * (doi/pmid/url) — nunca inventada.
   */
  referenceSources?: { id?: string; linked: boolean; sourceId?: string; citationText?: string; url?: string; verificacao?: string }[];
  isPremiumOnly?: boolean;
}

export interface QuestionOption {
  /**
   * Letra da alternativa (A, B, C, ...). Sem limite fixo de alfabeto — uma
   * questão pode ter quantas alternativas a prova de origem tiver (o
   * cadastro unitário do Admin continua fixo em A-D, mas o import de lote e
   * o resto do app não impõem teto nenhum, ver
   * docs/editorial/PADRAO-NEXUSMED-QUESTOES.md).
   */
  letter: string;
  text: string;
  isCorrect: boolean;
  explanation: string;
  mechanismReference?: string;
}

export interface Question {
  id: string;
  disciplineId: string;
  themeId: string;
  compendiumRefId: string; // Linking directly to compendium!
  compendiumSectionId?: string; // Exact section anchor
  cycle: MedicalCycle;
  difficulty: DifficultyLevel;
  institution: string; // USP, UNIFESP, UFRJ, ENARE, Revalida, etc.
  year: number;
  clinicalVignette: string;
  questionStem: string;
  options: QuestionOption[];
  generalCommentary: string;
  highYieldSummary: string;
  tags: string[];
  /** Controla visibilidade para estudantes via RLS (questions.status). */
  publicationStatus?: 'draft' | 'published' | 'archived';
  flashcardTemplate?: {
    front: string;
    back: string;
    mechanismNote: string;
  };
  isPremiumOnly?: boolean;
}

export interface FlashcardSRS {
  intervalDays: number;
  repetitionCount: number;
  easeFactor: number; // SM-2 standard default 2.5
  nextDueDate: string; // ISO date string
  lastReviewedDate?: string;
  state: 'new' | 'learning' | 'review' | 'mastered';
  reviewHistory: Array<{
    date: string;
    rating: 1 | 2 | 3 | 4; // 1: Errei, 2: Dificil, 3: Bom, 4: Facil
  }>;
}

export interface Flashcard {
  id: string;
  disciplineId: string;
  themeId: string;
  compendiumRefId?: string;
  questionOriginId?: string;
  derivedFromQuestionId?: string;
  front: string;
  back: string;
  mechanismHighlight: string;
  tags: string[];
  difficulty: DifficultyLevel;
  srs: FlashcardSRS;
  isCustom?: boolean;
  /**
   * Fontes bibliográficas herdadas da questão de origem (via
   * questionOriginId -> question_references -> sources), distintas de
   * `compendiumRefId` (material de origem dentro do próprio produto).
   * Ausente quando o flashcard não tem questão de origem, ou a questão de
   * origem não tem referência estruturada (não inventada).
   */
  bibliographicSources?: { sourceId: string; citationText: string; url?: string; verificacao?: string }[];
}

export type AppView =
  | 'dashboard'
  | 'thematic-study'
  | 'compendiums'
  | 'compendium_reader'
  | 'questions'
  | 'simulado_active'
  | 'flashcards'
  | 'flashcard_reviewer'
  | 'caderno_erros'
  | 'admin';

export interface QuestionAnswerRecord {
  questionId: string;
  selectedOption: string;
  isCorrect: boolean;
  timestamp: string;
  timeSpentSeconds: number;
  errorReason?: 'lacuna_teorica' | 'pegadinha' | 'falta_atencao' | 'tempo_esgotado' | 'raciocinio_clinico';
  userNotes?: string;
  answerMode?: 'open_recall' | 'multiple_choice';
  answerStrategy?: 'recognition' | 'elimination' | 'false_confidence' | 'guess';
}

// Gabarito de uma questão (quem está correta, explicação por alternativa),
// obtido via RPC (submit_question_attempt ou get_question_review) — nunca
// por SELECT direto em question_option_keys/question_answer_keys, que não
// têm policy de leitura para estudante (ver rls_policies.sql).
export interface QuestionReviewOption {
  optionId: string;
  letter: string;
  isCorrect: boolean;
  explanation: string;
}

// Fonte bibliográfica vinculada de forma estruturada a uma questão
// (question_references -> sources). Vínculo por QUESTÃO inteira, não por
// alternativa — o acervo (banco-questoes.json) só tem `referencias[]` no
// nível da questão, não uma fonte por alternativa. `url` é derivada de
// identificadores conhecidos (doi/pmid/url) só quando presentes — nunca
// inventada quando a fonte não tem identificador verificável.
export interface QuestionReviewReference {
  sourceId: string;
  citationText: string;
  tipo: string;
  verificacao: string;
  url?: string;
}

export interface QuestionReviewResult {
  isCorrect: boolean;
  correctOptionId: string;
  generalCommentary: string;
  highYieldSummary: string;
  options: QuestionReviewOption[];
  references: QuestionReviewReference[];
}

export interface SimuladoConfig {
  id: string;
  name: string;
  disciplineIds: string[];
  themeIds: string[];
  difficulties: DifficultyLevel[];
  cycles: MedicalCycle[];
  onlyMistakes: boolean;
  questionCount: number;
  timeLimitMinutes: number;
  isExamMode: boolean; // exam mode hides feedback until end
}

export interface SimuladoSessionData {
  id: string;
  config: SimuladoConfig;
  questionIds: string[];
  answers: Record<string, { selectedOption: string; timeSpent: number; clientOpId?: string }>;
  startedAt: string;
  completedAt?: string;
  score?: number;
  totalTimeSeconds: number;
}

export interface ErrorLogItem {
  id: string;
  questionId: string;
  timestamp: string;
  selectedOption: string;
  correctOption: string;
  errorReason: 'lacuna_teorica' | 'pegadinha' | 'falta_atencao' | 'tempo_esgotado' | 'raciocinio_clinico';
  userNotes: string;
  resolved: boolean;
}

export interface UserStats {
  totalAnswered: number;
  totalCorrect: number;
  streakDays: number;
  lastActiveDate: string;
  cardsReviewedToday: number;
  compendiumsReadCount: number;
}

export type FeedbackType = 'sugestao' | 'problema' | 'elogio';

export type FeedbackStatus = 'pendente' | 'em_analise' | 'resolvido';

export interface UserFeedback {
  id: string;
  type: FeedbackType;
  title: string;
  description: string;
  createdAt: string;
  // Preenchido pelo servidor (trigger `set_feedback_updated_at`, migration
  // sync_reliability_categorias_8_9) — ausente em itens só-locais que ainda
  // não foram confirmados pelo servidor. Nunca calculado no cliente.
  updatedAt?: string;
  userId?: string | null;
  userEmail?: string | null;
  questionId?: string | null;
  materialId?: string | null;
  status: FeedbackStatus;
}

export type QuestionReactionValue = 'up' | 'down';

export interface LastReadingSession {
  compendiumId: string;
  sectionId?: string;
  compendiumTitle: string;
  themeId?: string;
  themeName?: string;
  disciplineId?: string;
  disciplineName?: string;
  sectionTitle?: string;
  updatedAt: number;
}

// ============================================================================
// Proveniência editorial e atestação humana (Prompt 23-B).
// Ver supabase/migrations/20260914120000_content_provenance_attestation.sql.
// ============================================================================

/**
 * Rótulo de exibição do estado de proveniência de um material/questão,
 * calculado server-side por get_provenance_status() — nunca inferido no
 * cliente (evitaria recomputar o hash canônico do conteúdo).
 */
export type ProvenanceStatus =
  | 'legacy_unmapped'
  | 'em_revisao'
  | 'aprovado_para_esta_versao'
  | 'aprovacao_desatualizada';

export interface ContentRevision {
  id: string;
  materialId: string | null;
  questionId: string | null;
  revisionNumber: number;
  snapshotHash: string;
  policyVersion: string;
  createdBy: string;
  createdAt: string;
}

export type ClaimKind = 'source_claim' | 'synthesized_claim' | 'inference';
export type ClaimDecision = 'pendente' | 'aprovado' | 'requer_correcao_ou_fonte' | 'inferencia_aceita';
export type RiskCategory = 'alto' | 'medio' | 'baixo';

export interface Claim {
  id: string;
  contentRevisionId: string;
  claimText: string;
  claimKind: ClaimKind;
  contentLocator: string;
  riskCategory: RiskCategory | null;
  requiresSource: boolean;
  decision: ClaimDecision;
  decidedBy: string | null;
  decidedAt: string | null;
  sortOrder: number;
}

export type EvidenceRelation = 'supports' | 'contextualizes' | 'contradicts';
export type ConsultationBasis = 'directly_consulted' | 'indirectly_reported';
export type SourceConfidence = 'alta' | 'media' | 'baixa';

export interface ClaimSource {
  id: string;
  claimId: string;
  sourceId: string;
  evidenceRelation: EvidenceRelation;
  consultationBasis: ConsultationBasis;
  sourceLocator: string | null;
  verified: boolean;
  confidence: SourceConfidence | null;
  sortOrder: number;
}

export type ContentReviewDecision = 'aprovado' | 'rejeitado';

/**
 * Resumo legível de uma fonte do catálogo (`sources`), para o seletor
 * pesquisável do painel de revisão e da associação de referências de
 * material — nunca os metadados completos (o catálogo não tem campos
 * estruturados de autor/título/ano separados, só `citation_text` livre).
 */
export interface SourceSummary {
  id: string;
  citationText: string;
  tipo: string;
  verificacao: string;
  url?: string;
}

export interface ContentReview {
  id: string;
  contentRevisionId: string;
  reviewerUserId: string;
  decision: ContentReviewDecision;
  checklist: Record<string, unknown>;
  policyVersion: string;
  revisionHash: string;
  createdAt: string;
}
