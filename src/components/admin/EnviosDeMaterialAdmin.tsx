import React, { useState } from 'react';
import type { Discipline, Theme } from '../../types';
import {
  materialSubmissionsRepository,
  type MaterialSubmission,
} from '../../repositories/MaterialSubmissionsRepository';
import { useServerLoad } from '../../hooks/useServerLoad';
import { ConnectionNotice } from '../common/ConnectionNotice';
import { ListaDeEnvios } from '../material/ListaDeEnvios';

// Aba "Envios" da Área Editorial (44-E): todos os envios de material, só
// leitura. Trocar o estado do envio e publicar é do servidor (44-F/44-G), não
// desta tela.

interface EnviosDeMaterialAdminProps {
  disciplines: Discipline[];
  themes: Theme[];
  onAbrirMaterial?: (materialId: string) => void;
}

export const EnviosDeMaterialAdmin: React.FC<EnviosDeMaterialAdminProps> = ({ disciplines, themes, onAbrirMaterial }) => {
  const [envios, setEnvios] = useState<MaterialSubmission[]>([]);
  const { status } = useServerLoad(async () => {
    const lista = await materialSubmissionsRepository.listAll();
    return () => setEnvios(lista);
  }, 'envios-admin');

  return (
    <div id="admin-envios-de-material" className="space-y-4">
      <div className="bg-white dark:bg-[#0F172A] p-4 rounded-xl border border-stone-200 dark:border-[#243452] elev-xs">
        <h3 className="font-serif-reading text-base font-bold text-stone-900 dark:text-slate-100">
          Envios de material
        </h3>
        <p className="text-[11px] text-stone-500 dark:text-slate-400">
          Materiais enviados pelos usuários pelo site, do mais novo para o mais antigo. Só leitura: quando o
          revisor de IA aprova, o servidor publica o material sozinho (com o selo “revisado por IA”); aqui você
          acompanha e abre o que foi publicado.
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
        vazio="Nenhum material foi enviado ainda."
      />
    </div>
  );
};
