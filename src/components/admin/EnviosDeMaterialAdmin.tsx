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
import { ListaDeEnvios, type EnvioDaLista } from '../material/ListaDeEnvios';
import { publicarEnvioPeloAdmin } from '../../utils/publicarEnvioPeloAdmin';

// Aba "Envios" da Área Editorial (44-E): todos os envios, de material e de
// questões (44-H2). O revisor de IA só dá o parecer (44-F, D-12); desde a P8 o
// dono publica o envio (ou aplica a atualização) daqui, com um clique, com
// qualquer parecer: o botão pede confirmação quando o parecer não é "apto".

interface EnviosDeMaterialAdminProps {
  disciplines: Discipline[];
  themes: Theme[];
  onAbrirMaterial?: (materialId: string) => void;
  /** P8: o conteúdo foi ao ar por esta tela (a Área Editorial recarrega as listas). */
  onConteudoPublicado?: () => void;
}

export const EnviosDeMaterialAdmin: React.FC<EnviosDeMaterialAdminProps> = ({ disciplines, themes, onAbrirMaterial, onConteudoPublicado }) => {
  const [envios, setEnvios] = useState<Array<MaterialSubmission | QuestionSubmission>>([]);
  const { status, reload } = useServerLoad(async () => {
    const [materiais, questoes] = await Promise.all([
      materialSubmissionsRepository.listAll(),
      questionSubmissionsRepository.listAll(),
    ]);
    // Os dois tipos numa lista só, do mais novo para o mais antigo.
    const lista = [...materiais, ...questoes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return () => setEnvios(lista);
  }, 'envios-admin');

  const publicar = async (envio: EnvioDaLista) => {
    const r = await publicarEnvioPeloAdmin(envio, { disciplines, themes });
    if (r.ok) {
      onConteudoPublicado?.();
      // A lista passa a mostrar o envio como "publicado", com o botão que abre o material.
      void reload();
    }
    return r;
  };

  return (
    <div id="admin-envios-de-material" className="space-y-4">
      <div className="bg-white dark:bg-[#0F172A] p-4 rounded-xl border border-stone-200 dark:border-[#243452] elev-xs">
        <h3 className="font-serif-reading text-base font-bold text-stone-900 dark:text-slate-100">
          Envios de material e de questões
        </h3>
        <p className="text-[11px] text-stone-500 dark:text-slate-400">
          Materiais e questões enviados pelo site, do mais novo para o mais antigo. O revisor de IA dá o parecer
          (o veredito e os achados), a cada 15 minutos, quando o computador do dono está ligado; ele só aconselha, e
          quem decide e publica é você. “Publicar” (ou “Aplicar atualização”) funciona com qualquer parecer e pede
          confirmação quando o parecer não é “apto”; sem “apto”, o conteúdo vai ao ar sem o selo “Revisado por IA”.
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
        onPublicar={publicar}
        vazio="Nenhum material nem questões foram enviados ainda."
      />
    </div>
  );
};
