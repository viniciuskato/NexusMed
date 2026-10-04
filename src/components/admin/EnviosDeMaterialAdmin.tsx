import React, { useState } from 'react';
import type { Discipline, Theme } from '../../types';
import {
  materialSubmissionsRepository,
  type MaterialSubmission,
} from '../../repositories/MaterialSubmissionsRepository';
import {
  questionSubmissionsRepository,
  type QuestionSubmission,
} from '../../repositories/QuestionSubmissionsRepository';
import { useServerLoad } from '../../hooks/useServerLoad';
import { ConnectionNotice } from '../common/ConnectionNotice';
import { ListaDeEnvios } from '../material/ListaDeEnvios';

// Aba "Envios" da Área Editorial (44-E): todos os envios, de material e de
// questões (44-H2), só leitura. Trocar o estado do envio e publicar é do
// servidor (44-F/44-G/44-H2), não desta tela.

interface EnviosDeMaterialAdminProps {
  disciplines: Discipline[];
  themes: Theme[];
  onAbrirMaterial?: (materialId: string) => void;
}

export const EnviosDeMaterialAdmin: React.FC<EnviosDeMaterialAdminProps> = ({ disciplines, themes, onAbrirMaterial }) => {
  const [envios, setEnvios] = useState<Array<MaterialSubmission | QuestionSubmission>>([]);
  const { status } = useServerLoad(async () => {
    const [materiais, questoes] = await Promise.all([
      materialSubmissionsRepository.listAll(),
      questionSubmissionsRepository.listAll(),
    ]);
    // Os dois tipos numa lista só, do mais novo para o mais antigo.
    const lista = [...materiais, ...questoes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return () => setEnvios(lista);
  }, 'envios-admin');

  return (
    <div id="admin-envios-de-material" className="space-y-4">
      <div className="bg-white dark:bg-[#0F172A] p-4 rounded-xl border border-stone-200 dark:border-[#243452] elev-xs">
        <h3 className="font-serif-reading text-base font-bold text-stone-900 dark:text-slate-100">
          Envios de material e de questões
        </h3>
        <p className="text-[11px] text-stone-500 dark:text-slate-400">
          Materiais e questões enviados pelo site, do mais novo para o mais antigo. Só leitura: o revisor de IA
          dá o parecer (o veredito e os achados), a cada 15 minutos, quando o computador do dono está ligado, e
          quem decide e publica é você. Aqui você acompanha o que foi enviado e abre o que está no ar.
        </p>
      </div>
      <ConnectionNotice status={status} />
      <ListaDeEnvios
        id="admin-envios-lista"
        envios={envios}
        disciplines={disciplines}
        themes={themes}
        mostrarAutor
        onAbrirMaterial={onAbrirMaterial}
        vazio="Nenhum material nem questões foram enviados ainda."
      />
    </div>
  );
};
