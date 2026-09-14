import { supabase } from '../lib/supabaseClient';
import {
  Claim,
  ClaimDecision,
  ClaimKind,
  ClaimSource,
  ConsultationBasis,
  ContentReview,
  ContentReviewDecision,
  ContentRevision,
  EvidenceRelation,
  ProvenanceStatus,
  RiskCategory,
  SourceConfidence,
} from '../types';

// ============================================================================
// ContentProvenanceRepository (Prompt 23-B)
// ============================================================================
//
// Sem fallback local: proveniência/atestação é uma feature exclusivamente
// administrativa (Área Editorial), depende de identidade real via
// auth.uid() server-side — não faz sentido, e seria inseguro, ter um
// "modo offline" que finge aprovar uma revisão. Só existe contra Supabase.
//
// created_by/reviewer_user_id/snapshot/hash/horário nunca são enviados pelo
// cliente — sempre computados dentro das RPCs (create_content_revision/
// attest_content_revision), ver a migration para o contrato completo.
// ============================================================================

interface ContentRevisionRow {
  id: string;
  material_id: string | null;
  question_id: string | null;
  revision_number: number;
  snapshot_hash: string;
  policy_version: string;
  created_by: string;
  created_at: string;
}

interface ClaimRow {
  id: string;
  content_revision_id: string;
  claim_text: string;
  claim_kind: string;
  content_locator: string;
  risk_category: string | null;
  requires_source: boolean;
  decision: string;
  decided_by: string | null;
  decided_at: string | null;
  sort_order: number;
}

interface ClaimSourceRow {
  id: string;
  claim_id: string;
  source_id: string;
  evidence_relation: string;
  consultation_basis: string;
  source_locator: string | null;
  verified: boolean;
  confidence: string | null;
  sort_order: number;
}

interface ContentReviewRow {
  id: string;
  content_revision_id: string;
  reviewer_user_id: string;
  decision: string;
  checklist: Record<string, unknown>;
  policy_version: string;
  revision_hash: string;
  created_at: string;
}

function rowToRevision(r: ContentRevisionRow): ContentRevision {
  return {
    id: r.id,
    materialId: r.material_id,
    questionId: r.question_id,
    revisionNumber: r.revision_number,
    snapshotHash: r.snapshot_hash,
    policyVersion: r.policy_version,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

function rowToClaim(r: ClaimRow): Claim {
  return {
    id: r.id,
    contentRevisionId: r.content_revision_id,
    claimText: r.claim_text,
    claimKind: r.claim_kind as ClaimKind,
    contentLocator: r.content_locator,
    riskCategory: (r.risk_category as RiskCategory | null) ?? null,
    requiresSource: r.requires_source,
    decision: r.decision as ClaimDecision,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    sortOrder: r.sort_order,
  };
}

function rowToClaimSource(r: ClaimSourceRow): ClaimSource {
  return {
    id: r.id,
    claimId: r.claim_id,
    sourceId: r.source_id,
    evidenceRelation: r.evidence_relation as EvidenceRelation,
    consultationBasis: r.consultation_basis as ConsultationBasis,
    sourceLocator: r.source_locator,
    verified: r.verified,
    confidence: (r.confidence as SourceConfidence | null) ?? null,
    sortOrder: r.sort_order,
  };
}

function rowToReview(r: ContentReviewRow): ContentReview {
  return {
    id: r.id,
    contentRevisionId: r.content_revision_id,
    reviewerUserId: r.reviewer_user_id,
    decision: r.decision as ContentReviewDecision,
    checklist: r.checklist ?? {},
    policyVersion: r.policy_version,
    revisionHash: r.revision_hash,
    createdAt: r.created_at,
  };
}

export class ContentProvenanceRepository {
  async getProvenanceStatus(target: { materialId?: string; questionId?: string }): Promise<ProvenanceStatus> {
    const { data, error } = await supabase.rpc('get_provenance_status', {
      p_material_id: target.materialId ?? null,
      p_question_id: target.questionId ?? null,
    });
    if (error) throw error;
    return data as ProvenanceStatus;
  }

  async listRevisions(target: { materialId?: string; questionId?: string }): Promise<ContentRevision[]> {
    let query = supabase.from('content_revisions').select('*').order('revision_number', { ascending: false });
    query = target.materialId ? query.eq('material_id', target.materialId) : query.eq('question_id', target.questionId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(rowToRevision);
  }

  async createRevision(target: { materialId?: string; questionId?: string }): Promise<ContentRevision> {
    const { data, error } = await supabase.rpc('create_content_revision', {
      p_material_id: target.materialId ?? null,
      p_question_id: target.questionId ?? null,
    });
    if (error) throw error;
    return rowToRevision(data as ContentRevisionRow);
  }

  async listClaims(contentRevisionId: string): Promise<Claim[]> {
    const { data, error } = await supabase
      .from('claims')
      .select('*')
      .eq('content_revision_id', contentRevisionId)
      .order('sort_order');
    if (error) throw error;
    return (data ?? []).map(rowToClaim);
  }

  async addClaim(input: {
    contentRevisionId: string;
    claimText: string;
    claimKind: ClaimKind;
    contentLocator: string;
    riskCategory?: RiskCategory | null;
    requiresSource: boolean;
    sortOrder?: number;
  }): Promise<Claim> {
    const { data, error } = await supabase
      .from('claims')
      .insert({
        content_revision_id: input.contentRevisionId,
        claim_text: input.claimText,
        claim_kind: input.claimKind,
        content_locator: input.contentLocator,
        risk_category: input.riskCategory ?? null,
        requires_source: input.requiresSource,
        sort_order: input.sortOrder ?? 0,
      })
      .select('*')
      .single();
    if (error) throw error;
    return rowToClaim(data as ClaimRow);
  }

  async decideClaim(claimId: string, decision: ClaimDecision): Promise<void> {
    // decided_by/decided_at são derivados de auth.uid()/horário do banco
    // pelo trigger guard_claim_writes — não enviados aqui.
    const { error } = await supabase.from('claims').update({ decision }).eq('id', claimId);
    if (error) throw error;
  }

  async listClaimSources(claimId: string): Promise<ClaimSource[]> {
    const { data, error } = await supabase
      .from('claim_sources')
      .select('*')
      .eq('claim_id', claimId)
      .order('sort_order');
    if (error) throw error;
    return (data ?? []).map(rowToClaimSource);
  }

  async addClaimSource(input: {
    claimId: string;
    sourceId: string;
    evidenceRelation: EvidenceRelation;
    consultationBasis: ConsultationBasis;
    sourceLocator?: string | null;
    confidence?: SourceConfidence | null;
    sortOrder?: number;
  }): Promise<ClaimSource> {
    const { data, error } = await supabase
      .from('claim_sources')
      .insert({
        claim_id: input.claimId,
        source_id: input.sourceId,
        evidence_relation: input.evidenceRelation,
        consultation_basis: input.consultationBasis,
        source_locator: input.sourceLocator ?? null,
        confidence: input.confidence ?? null,
        sort_order: input.sortOrder ?? 0,
      })
      .select('*')
      .single();
    if (error) throw error;
    return rowToClaimSource(data as ClaimSourceRow);
  }

  async attestRevision(
    contentRevisionId: string,
    decision: ContentReviewDecision,
    checklist: Record<string, unknown> = {}
  ): Promise<ContentReview> {
    const { data, error } = await supabase.rpc('attest_content_revision', {
      p_content_revision_id: contentRevisionId,
      p_decision: decision,
      p_checklist: checklist,
    });
    if (error) throw error;
    return rowToReview(data as ContentReviewRow);
  }
}

export const contentProvenanceRepository = new ContentProvenanceRepository();
