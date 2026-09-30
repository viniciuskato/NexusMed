import React, { useState } from 'react';
import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { materialSealRepository, type SeloDeRevisao as Selo } from '../../repositories/MaterialSealRepository';
import { useServerLoad } from '../../hooks/useServerLoad';

// Selo do leitor (44-G): diz, em uma frase, como o material foi revisado. Só
// aparece em material publicado pelo revisor de IA; material antigo não mostra
// selo novo. É informação, não alerta: cores neutras e texto curto.

export const TEXTO_DO_SELO: Record<Selo, string> = {
  ia: 'Revisado por IA — ainda não lido por uma pessoa',
  ia_e_pessoa: 'Revisado por IA e por uma pessoa',
};

interface SeloDeRevisaoProps {
  materialId: string;
}

export const SeloDeRevisao: React.FC<SeloDeRevisaoProps> = ({ materialId }) => {
  // O leitor é reaproveitado ao navegar entre materiais: o selo só vale para o
  // material para o qual ele foi carregado.
  const [carregado, setCarregado] = useState<{ materialId: string; selo: Selo | null } | null>(null);
  // Carga decorativa: se falhar, o material aparece sem selo (o hook tenta de novo sozinho).
  useServerLoad(async () => {
    const selo = await materialSealRepository.getSeal(materialId);
    return () => setCarregado({ materialId, selo });
  }, materialId);

  if (!carregado || carregado.materialId !== materialId || !carregado.selo) return null;
  const Icone = carregado.selo === 'ia_e_pessoa' ? BadgeCheck : ShieldCheck;
  return (
    <p
      data-testid="selo-de-revisao"
      data-selo={carregado.selo}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs font-medium text-teal-900 dark:text-teal-200"
    >
      <Icone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{TEXTO_DO_SELO[carregado.selo]}</span>
    </p>
  );
};
