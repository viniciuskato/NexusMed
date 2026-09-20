import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X, FileCheck2, Plus, Link2 } from 'lucide-react';
import {
  Claim,
  ClaimDecision,
  ClaimKind,
  ClaimSource,
  ConsultationBasis,
  EvidenceRelation,
  ProvenanceStatus,
  RiskCategory,
  SourceSummary,
} from '../../types';
import { contentProvenanceRepository } from '../../repositories/ContentProvenanceRepository';
import { getErrorMessage } from '../../utils/errorMessage';
import SourceSelector from './SourceSelector';

const EVIDENCE_RELATION_LABEL: Record<EvidenceRelation, string> = {
  supports: 'Sustenta',
  contextualizes: 'Contextualiza',
  contradicts: 'Contradiz',
};

const CONSULTATION_BASIS_LABEL: Record<ConsultationBasis, string> = {
  directly_consulted: 'Consultada diretamente',
  indirectly_reported: 'Reportada indiretamente',
};

// ============================================================================
// ProvenanceReviewPanel (Prompt 23-B)
// ============================================================================
//
// Menor fluxo vertical completo de revisão/atestação editorial, para
// material OU questão (nunca material_section isolada — decisão da
// diretoria em 23-A). Fica DENTRO da Área Editorial, aberto por um botão
// "Revisão" ao lado de Publicar/Despublicar — não substitui nem refatora o
// form grande de edição de conteúdo.
//
// Sem essa aprovação, publish_material()/publish_question() rejeitam a
// publicação (gate no banco, não só aqui) — este painel é o único lugar da
// UI onde dá pra: criar uma revisão (snapshot do estado atual), decidir cada
// claim, vincular fontes, e atestar (aprovar/rejeitar) a revisão.
// ============================================================================

const STATUS_LABEL: Record<ProvenanceStatus, string> = {
  legacy_unmapped: 'Legado não mapeado',
  em_revisao: 'Em revisão',
  aprovado_para_esta_versao: 'Aprovado para esta versão',
  aprovacao_desatualizada: 'Aprovação desatualizada',
};

const STATUS_CLASS: Record<ProvenanceStatus, string> = {
  legacy_unmapped: 'bg-stone-100 dark:bg-[#1A2845] text-stone-600 dark:text-slate-300',
  em_revisao: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
  aprovado_para_esta_versao: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
  aprovacao_desatualizada: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',
};

const CLAIM_KIND_LABEL: Record<ClaimKind, string> = {
  source_claim: 'Afirmação de fonte',
  synthesized_claim: 'Síntese',
  inference: 'Inferência',
};

interface ProvenanceContentOption {
  locator: string;
  label: string;
}

interface ProvenanceReviewPanelProps {
  target: { materialId: string } | { questionId: string };
  title: string;
  onClose: () => void;
  onChanged?: () => void;
  /**
   * Seções (material) ou partes (enunciado/alternativas de questão) do
   * conteúdo atual, para preencher "Localização estável" e um texto de claim
   * sugerido por seleção — evita ter que copiar título/trecho manualmente.
   * Opcional: sem isso, os campos continuam 100% de texto livre.
   */
  contentOptions?: ProvenanceContentOption[];
}

interface ClaimSourceLinkForm {
  source: SourceSummary | null;
  evidenceRelation: EvidenceRelation;
  consultationBasis: ConsultationBasis;
  sourceLocator: string;
}

const emptyLinkForm = (): ClaimSourceLinkForm => ({
  source: null,
  evidenceRelation: 'supports',
  consultationBasis: 'directly_consulted',
  sourceLocator: '',
});

export default function ProvenanceReviewPanel({
  target,
  title,
  onClose,
  onChanged,
  contentOptions,
}: ProvenanceReviewPanelProps) {
  const [status, setStatus] = useState<ProvenanceStatus | null>(null);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [revisionAttested, setRevisionAttested] = useState<boolean | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [claimText, setClaimText] = useState('');
  const [claimKind, setClaimKind] = useState<ClaimKind>('synthesized_claim');
  const [claimLocator, setClaimLocator] = useState('');
  const [claimRisk, setClaimRisk] = useState<RiskCategory | ''>('');
  const [claimRequiresSource, setClaimRequiresSource] = useState(false);
  const [selectedContentOption, setSelectedContentOption] = useState('');

  const [claimSourcesByClaim, setClaimSourcesByClaim] = useState<Record<string, ClaimSource[]>>({});
  const [sourcesById, setSourcesById] = useState<Map<string, SourceSummary>>(new Map());
  const [linkFormByClaim, setLinkFormByClaim] = useState<Record<string, ClaimSourceLinkForm>>({});

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Traz o painel pra vista e move o foco pra ele assim que é aberto —
    // antes disso, um botão "Revisão" clicado na aba de questões abria o
    // painel renderizado só na aba de compêndios, invisível (21-D).
    panelRef.current?.focus();
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const s = await contentProvenanceRepository.getProvenanceStatus(target);
      setStatus(s);

      const revisions = await contentProvenanceRepository.listRevisions(target);
      const latest = revisions[0] ?? null;
      if (latest) {
        setRevisionId(latest.id);
        const cs = await contentProvenanceRepository.listClaims(latest.id);
        setClaims(cs);
        // Uma revisão já atestada nunca tem claim editável (trigger no
        // banco bloqueia) — usamos "todo claim decidido" como sinal
        // aproximado; o estado real (aprovado_para_esta_versao/desatualizada)
        // já veio de get_provenance_status acima.
        setRevisionAttested(s === 'aprovado_para_esta_versao' || s === 'aprovacao_desatualizada');

        const claimSourcesLists = await Promise.all(cs.map((c) => contentProvenanceRepository.listClaimSources(c.id)));
        const byClaim: Record<string, ClaimSource[]> = {};
        const allSourceIds: string[] = [];
        cs.forEach((c, i) => {
          byClaim[c.id] = claimSourcesLists[i];
          allSourceIds.push(...claimSourcesLists[i].map((cSrc) => cSrc.sourceId));
        });
        setClaimSourcesByClaim(byClaim);
        setSourcesById(await contentProvenanceRepository.getSourcesByIds(allSourceIds));
      } else {
        setRevisionId(null);
        setClaims([]);
        setRevisionAttested(null);
        setClaimSourcesByClaim({});
      }
    } catch (err) {
      showToast(`Erro ao carregar proveniência: ${getErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateRevision = async () => {
    setBusy(true);
    try {
      await contentProvenanceRepository.createRevision(target);
      showToast('Nova revisão criada a partir do conteúdo atual.');
      await load();
    } catch (err) {
      showToast(`Erro ao criar revisão: ${getErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAddClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionId || !claimText.trim() || !claimLocator.trim()) return;
    setBusy(true);
    try {
      await contentProvenanceRepository.addClaim({
        contentRevisionId: revisionId,
        claimText: claimText.trim(),
        claimKind,
        contentLocator: claimLocator.trim(),
        riskCategory: claimRisk || null,
        requiresSource: claimRequiresSource,
        sortOrder: claims.length,
      });
      setClaimText('');
      setClaimLocator('');
      setClaimRisk('');
      setClaimRequiresSource(false);
      setSelectedContentOption('');
      await load();
    } catch (err) {
      showToast(`Erro ao adicionar claim: ${getErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  // Seleção de seção/parte do conteúdo real: preenche "Localização estável"
  // sempre, e sugere um texto de claim só quando o campo ainda está vazio —
  // não sobrescreve texto que o usuário já tenha digitado/ajustado à mão.
  const handleSelectContentOption = (locator: string) => {
    setSelectedContentOption(locator);
    if (!locator) return;
    const option = contentOptions?.find((o) => o.locator === locator);
    if (!option) return;
    setClaimLocator(option.locator);
    if (!claimText.trim()) {
      setClaimText(`Conteúdo de "${option.label}" corresponde às referências citadas inline (marcadores [N]).`);
    }
  };

  const handleDecideClaim = async (claimId: string, decision: ClaimDecision) => {
    setBusy(true);
    try {
      await contentProvenanceRepository.decideClaim(claimId, decision);
      await load();
    } catch (err) {
      showToast(`Erro ao decidir claim: ${getErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const getLinkForm = (claimId: string): ClaimSourceLinkForm => linkFormByClaim[claimId] ?? emptyLinkForm();

  const setLinkForm = (claimId: string, patch: Partial<ClaimSourceLinkForm>) => {
    setLinkFormByClaim((prev) => ({ ...prev, [claimId]: { ...getLinkForm(claimId), ...patch } }));
  };

  const handleAddSource = async (claimId: string) => {
    const form = getLinkForm(claimId);
    if (!form.source) return;
    setBusy(true);
    try {
      await contentProvenanceRepository.addClaimSource({
        claimId,
        sourceId: form.source.id,
        evidenceRelation: form.evidenceRelation,
        consultationBasis: form.consultationBasis,
        sourceLocator: form.sourceLocator.trim() || null,
      });
      setLinkFormByClaim((prev) => ({ ...prev, [claimId]: emptyLinkForm() }));
      await load();
    } catch (err) {
      showToast(`Erro ao vincular fonte: ${getErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAttest = async (decision: 'aprovado' | 'rejeitado') => {
    if (!revisionId) return;
    setBusy(true);
    try {
      await contentProvenanceRepository.attestRevision(revisionId, decision);
      showToast(decision === 'aprovado' ? 'Revisão aprovada.' : 'Revisão rejeitada.');
      await load();
      onChanged?.();
    } catch (err) {
      showToast(`Não atestado: ${getErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      id="provenance-review-panel"
      ref={panelRef}
      tabIndex={-1}
      data-provenance-status={status ?? undefined}
      className="bg-white dark:bg-[#0F172A] rounded-2xl border-2 border-teal-500/50 dark:border-teal-500/60 p-6 sm:p-8 elev-md space-y-5 text-xs animate-in fade-in focus:outline-none"
    >
      <div className="flex items-center justify-between border-b border-stone-200 dark:border-[#243452] pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <h3 className="font-serif-reading text-lg font-bold text-stone-900 dark:text-slate-100">
            Revisão editorial — {title}
          </h3>
          {status && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLASS[status]}`}>
              {STATUS_LABEL[status]}
            </span>
          )}
        </div>
        <button
          type="button"
          id="provenance-review-close"
          onClick={onClose}
          className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-slate-200 hover:bg-stone-100 dark:hover:bg-[#142038] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {toast && (
        <div className="px-3 py-2 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-semibold">
          {toast}
        </div>
      )}

      <p className="text-stone-500 dark:text-slate-400">
        Aprovação editorial de conteúdo — não é assinatura digital qualificada. A identidade do autor/revisor vem do
        login autenticado (nunca de texto digitado aqui). Publicar exige pelo menos um claim decidido e a revisão
        atestada como aprovada — isso vale mesmo quando o conteúdo já está correto: é um registro de decisão
        explícito, não uma busca por erros.
      </p>

      {loading ? (
        <p className="text-stone-500 dark:text-slate-400">Carregando…</p>
      ) : (
        <>
          {!revisionId || revisionAttested ? (
            <button
              type="button"
              onClick={handleCreateRevision}
              disabled={busy}
              className="px-3.5 py-2 rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 hover:dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>{revisionId ? 'Criar nova revisão (conteúdo atual)' : 'Criar primeira revisão'}</span>
            </button>
          ) : (
            <>
              <div className="rounded-lg border border-stone-200 dark:border-[#243452] p-4 space-y-3">
                <h4 className="font-bold text-stone-700 dark:text-slate-300">Claims desta revisão</h4>
                {claims.length === 0 ? (
                  <p className="text-stone-500 dark:text-slate-400">
                    Nenhum claim registrado ainda. Adicione ao menos um antes de conseguir atestar — um claim de
                    síntese por seção já basta quando o conteúdo está correto, não precisa achar um problema para
                    registrar.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {claims.map((c) => (
                      <li key={c.id} className="rounded-lg border border-stone-200 dark:border-[#243452] p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-stone-800 dark:text-slate-200">{c.claimText}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-[#1A2845] text-stone-500 dark:text-slate-400 shrink-0">
                            {CLAIM_KIND_LABEL[c.claimKind]}
                          </span>
                        </div>
                        <div className="text-[10px] text-stone-400 font-mono-code">{c.contentLocator}</div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-stone-500 dark:text-slate-400">Decisão: {c.decision}</span>
                          {c.requiresSource && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                              exige fonte
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDecideClaim(c.id, 'aprovado')}
                            className="px-2 py-1 rounded border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-semibold cursor-pointer disabled:opacity-50"
                          >
                            Aprovar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDecideClaim(c.id, 'requer_correcao_ou_fonte')}
                            className="px-2 py-1 rounded border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 font-semibold cursor-pointer disabled:opacity-50"
                          >
                            Requer correção/fonte
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDecideClaim(c.id, 'inferencia_aceita')}
                            className="px-2 py-1 rounded border border-sky-200 dark:border-sky-900 text-sky-700 dark:text-sky-300 font-semibold cursor-pointer disabled:opacity-50"
                          >
                            Inferência aceita
                          </button>
                        </div>
                        {(claimSourcesByClaim[c.id]?.length ?? 0) > 0 && (
                          <ul className="space-y-1 pt-1">
                            {claimSourcesByClaim[c.id].map((cs) => {
                              const src = sourcesById.get(cs.sourceId);
                              return (
                                <li
                                  key={cs.id}
                                  className="flex items-center gap-1.5 flex-wrap px-2 py-1 rounded bg-stone-50 dark:bg-[#0B1424] border border-stone-200 dark:border-[#243452]"
                                >
                                  <Link2 className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                                  <span className="font-semibold text-stone-700 dark:text-slate-300 truncate">
                                    {src?.citationText ?? cs.sourceId}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-[#142038] text-stone-500 dark:text-slate-400">
                                    {EVIDENCE_RELATION_LABEL[cs.evidenceRelation]}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-[#142038] text-stone-500 dark:text-slate-400">
                                    {CONSULTATION_BASIS_LABEL[cs.consultationBasis]}
                                  </span>
                                  {cs.sourceLocator && (
                                    <span className="text-[10px] text-stone-400 font-mono-code">{cs.sourceLocator}</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        {!revisionAttested && (
                          <div className="space-y-1.5 pt-1 border-t border-stone-100 dark:border-[#243452]">
                            <SourceSelector
                              id={`source-selector-${c.id}`}
                              selected={getLinkForm(c.id).source}
                              onSelect={(s) => setLinkForm(c.id, { source: s })}
                              onClear={() => setLinkForm(c.id, { source: null })}
                              disabled={busy}
                            />
                            <div className="grid grid-cols-2 gap-1.5">
                              <select
                                id={`evidence-relation-${c.id}`}
                                value={getLinkForm(c.id).evidenceRelation}
                                onChange={(e) => setLinkForm(c.id, { evidenceRelation: e.target.value as EvidenceRelation })}
                                className="px-2 py-1 rounded border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0B1424] text-stone-900 dark:text-slate-100"
                              >
                                <option value="supports">Sustenta</option>
                                <option value="contextualizes">Contextualiza</option>
                                <option value="contradicts">Contradiz</option>
                              </select>
                              <select
                                id={`consultation-basis-${c.id}`}
                                value={getLinkForm(c.id).consultationBasis}
                                onChange={(e) => setLinkForm(c.id, { consultationBasis: e.target.value as ConsultationBasis })}
                                className="px-2 py-1 rounded border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0B1424] text-stone-900 dark:text-slate-100"
                              >
                                <option value="directly_consulted">Consultada diretamente</option>
                                <option value="indirectly_reported">Reportada indiretamente</option>
                              </select>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={getLinkForm(c.id).sourceLocator}
                                onChange={(e) => setLinkForm(c.id, { sourceLocator: e.target.value })}
                                placeholder="Localização dentro da fonte (opcional, ex.: p. 12, tabela 3)"
                                className="flex-1 px-2 py-1 rounded border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0B1424] text-stone-900 dark:text-slate-100"
                              />
                              <button
                                type="button"
                                disabled={busy || !getLinkForm(c.id).source}
                                onClick={() => handleAddSource(c.id)}
                                className="px-2 py-1 rounded bg-teal-700 hover:bg-teal-800 text-white font-semibold cursor-pointer disabled:opacity-50 shrink-0"
                              >
                                Vincular fonte
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <form onSubmit={handleAddClaim} className="pt-2 border-t border-stone-200 dark:border-[#243452] space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span className="font-bold text-stone-700 dark:text-slate-300">Adicionar claim</span>
                  </div>
                  {contentOptions && contentOptions.length > 0 && (
                    <select
                      value={selectedContentOption}
                      onChange={(e) => handleSelectContentOption(e.target.value)}
                      className="w-full px-2 py-1.5 rounded border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0B1424] text-stone-900 dark:text-slate-100"
                    >
                      <option value="">Selecionar seção/trecho (preenche texto e localização abaixo)</option>
                      {contentOptions.map((o) => (
                        <option key={o.locator} value={o.locator}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <textarea
                    value={claimText}
                    onChange={(e) => setClaimText(e.target.value)}
                    placeholder="Texto do claim"
                    rows={2}
                    className="w-full px-2 py-1.5 rounded border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0B1424] text-stone-900 dark:text-slate-100"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={claimKind}
                      onChange={(e) => setClaimKind(e.target.value as ClaimKind)}
                      className="px-2 py-1.5 rounded border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0B1424] text-stone-900 dark:text-slate-100"
                    >
                      <option value="source_claim">Afirmação de fonte</option>
                      <option value="synthesized_claim">Síntese</option>
                      <option value="inference">Inferência</option>
                    </select>
                    <input
                      type="text"
                      value={claimLocator}
                      onChange={(e) => setClaimLocator(e.target.value)}
                      placeholder="Localização estável (ex.: section:...:paragraph:1)"
                      className="px-2 py-1.5 rounded border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0B1424] text-stone-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={claimRisk}
                      onChange={(e) => setClaimRisk(e.target.value as RiskCategory | '')}
                      className="px-2 py-1.5 rounded border border-stone-200 dark:border-[#243452] bg-white dark:bg-[#0B1424] text-stone-900 dark:text-slate-100"
                    >
                      <option value="">Categoria de risco (opcional)</option>
                      <option value="alto">Alto</option>
                      <option value="medio">Médio</option>
                      <option value="baixo">Baixo</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-stone-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={claimRequiresSource}
                        onChange={(e) => setClaimRequiresSource(e.target.checked)}
                      />
                      Exige fonte
                    </label>
                    <button
                      type="submit"
                      disabled={busy || !claimText.trim() || !claimLocator.trim()}
                      className="ml-auto px-3 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white font-bold cursor-pointer disabled:opacity-50"
                    >
                      Adicionar
                    </button>
                  </div>
                </form>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-stone-200 dark:border-[#243452]">
                <button
                  type="button"
                  disabled={busy || claims.length === 0}
                  onClick={() => handleAttest('aprovado')}
                  className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  Atestar — Aprovar revisão
                </button>
                <button
                  type="button"
                  disabled={busy || claims.length === 0}
                  onClick={() => handleAttest('rejeitado')}
                  className="px-3.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  Atestar — Rejeitar
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
