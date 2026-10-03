import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileUp, TriangleAlert, X } from 'lucide-react';
import type { Compendium, Discipline, Theme } from '../../types';
import { materialSubmissionsRepository } from '../../repositories/MaterialSubmissionsRepository';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import {
  LIMITE_LEITURA_DE_ARQUIVO_BYTES,
  LIMITE_TEXTO_BYTES,
  avaliarEnvio,
  descreverAvisoDaImportacao,
  frasesDoTituloLongo,
  lerArquivoParaEnvio,
  lerMaterialParaPublicar,
  mensagemDeErroDoEnvio,
  tamanhoLegivel,
} from '../../utils/envioDeMaterial';
import { baixarArquivoDeTexto, exportarMaterialParaMarkdown } from '../../utils/exportarMaterial';
import { compararComPublicado } from '../../utils/atualizarMaterial';

// ============================================================================
// "Exportar .md" e "Atualizar a partir de arquivo" no leitor do material (44-B)
//
// Aparecem só para quem pode (admin ativo, ou o autor do envio que publicou o
// material; quem decide é o banco). Exportar é livre: baixa o arquivo no formato
// do padrão. Atualizar NÃO grava no material: é um envio do tipo "atualização",
// que passa pela revisão de IA; com o "apto", o servidor troca o conteúdo que está
// no ar (44-G/44-B). Até lá, o material continua como está.
// ============================================================================

interface AtualizarMaterialProps {
  compendium: Compendium;
  disciplines: Discipline[];
  themes: Theme[];
}

const MAX_ITENS_NA_PREVIA = 12;

const botaoClass =
  'min-h-11 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed';

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <div>
      {titulo && <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{titulo}</p>}
      <ul className="list-disc pl-5 text-sm text-slate-800 dark:text-slate-200 space-y-0.5">
        {itens.slice(0, MAX_ITENS_NA_PREVIA).map((t, i) => (
          <li key={`${t}-${i}`} className="break-words">
            {t}
          </li>
        ))}
      </ul>
      {itens.length > MAX_ITENS_NA_PREVIA && (
        <p className="text-xs text-slate-500 dark:text-slate-400">e mais {itens.length - MAX_ITENS_NA_PREVIA}.</p>
      )}
    </div>
  );
}

const Dialogo: React.FC<AtualizarMaterialProps & { onClose: () => void }> = ({ compendium, disciplines, themes, onClose }) => {
  const idBase = useId();
  const titleId = `${idBase}-titulo`;
  const seletor = useRef<HTMLInputElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogA11y<HTMLDivElement>({ onClose, initialFocusRef: fecharRef });
  const [texto, setTexto] = useState('');
  const [nomeDoArquivo, setNomeDoArquivo] = useState('');
  const [avisoDoArquivo, setAvisoDoArquivo] = useState('');
  const [secoesDasQuestoes, setSecoesDasQuestoes] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    // Só enfeita a prévia (quantas questões perdem a seção): se falhar, a prévia sai sem esse aviso.
    let ativo = true;
    materialSubmissionsRepository
      .secoesDasQuestoes(compendium.id)
      .then((ids) => ativo && setSecoesDasQuestoes(ids))
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [compendium.id]);

  const leitura = useMemo(() => (texto ? lerArquivoParaEnvio(texto, disciplines, themes) : null), [texto, disciplines, themes]);
  const avaliacao = useMemo(
    () =>
      leitura
        ? avaliarEnvio(leitura, { disciplineId: compendium.disciplineId, themeId: compendium.themeId }, disciplines, themes)
        : null,
    [leitura, compendium.disciplineId, compendium.themeId, disciplines, themes],
  );
  const previa = useMemo(() => {
    if (!avaliacao?.aceito) return null;
    const lido = lerMaterialParaPublicar(texto, disciplines, themes);
    if (!lido.ok) return null;
    return compararComPublicado(
      compendium,
      lido.material,
      secoesDasQuestoes.map((id) => ({ compendiumSectionId: id, materialLinks: [] })),
    );
  }, [avaliacao, texto, disciplines, themes, compendium, secoesDasQuestoes]);

  const carregar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setEnviado(false);
    setErro('');
    if (arquivo.size > LIMITE_LEITURA_DE_ARQUIVO_BYTES) {
      setAvisoDoArquivo(
        `O arquivo “${arquivo.name}” tem ${tamanhoLegivel(arquivo.size)} e passa muito de ${tamanhoLegivel(LIMITE_TEXTO_BYTES)}. Reduza o material ou divida-o em mais de um.`,
      );
      return;
    }
    setAvisoDoArquivo('');
    setNomeDoArquivo(arquivo.name);
    setTexto(await arquivo.text());
  };

  const enviar = async () => {
    if (!leitura || !previa || previa.identico || enviando) return;
    setEnviando(true);
    setErro('');
    try {
      await materialSubmissionsRepository.submitUpdate({
        targetMaterialId: compendium.id,
        title: leitura.titulo,
        contentMd: texto,
      });
      setEnviado(true);
      setTexto('');
      setNomeDoArquivo('');
    } catch (err) {
      setErro(mensagemDeErroDoEnvio(err));
    } finally {
      setEnviando(false);
    }
  };

  const itensDePendencia = avaliacao
    ? [
        ...avaliacao.avisosDaImportacao.map((a) => descreverAvisoDaImportacao(a)),
        ...avaliacao.pendencias.map((p) => `Linha ${p.linha} · ${p.secao}: ${p.mensagem}`),
      ]
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-[#243452] elev-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-4 flex items-start justify-between gap-3 border-b border-slate-200 dark:border-[#243452]">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-bold text-slate-900 dark:text-slate-100">
              Atualizar a partir de arquivo
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 break-words">{compendium.title}</p>
          </div>
          <button
            ref={fecharRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-11 h-11 -mt-1 -mr-1 shrink-0 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            Escolha o arquivo .md com o material já corrigido (de preferência, o que você exportou daqui). A atualização
            não muda nada na hora: ela passa pela revisão de IA e, só se for aprovada, troca o conteúdo que está no ar.
            Posição na árvore, progresso de leitura e questões continuam.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" id="atualizar-escolher-arquivo" onClick={() => seletor.current?.click()} className={botaoClass}>
              <FileUp className="w-4 h-4" aria-hidden="true" />
              <span>Escolher arquivo .md</span>
            </button>
            {nomeDoArquivo && (
              <span id="atualizar-nome-arquivo" className="text-xs text-slate-500 dark:text-slate-400">
                {nomeDoArquivo}
              </span>
            )}
            <input
              ref={seletor}
              id="atualizar-arquivo"
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              onChange={carregar}
              className="sr-only"
              tabIndex={-1}
              aria-label="Arquivo do material atualizado (.md)"
            />
          </div>
          {avisoDoArquivo && (
            <p role="alert" className="text-xs text-amber-800 dark:text-amber-300">
              {avisoDoArquivo}
            </p>
          )}

          <div id="atualizar-resultado" role="status" aria-live="polite" className="space-y-3">
            {avaliacao && !avaliacao.aceito && (
              <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 space-y-2">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 flex items-start gap-2">
                  <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>O arquivo ainda não pode ser enviado. Corrija o que está abaixo.</span>
                </p>
                {avaliacao.tamanhoExcedido && (
                  <p className="text-sm text-slate-800 dark:text-slate-200">
                    O texto tem {tamanhoLegivel(avaliacao.bytes)} e o limite é {tamanhoLegivel(LIMITE_TEXTO_BYTES)}.
                  </p>
                )}
                <Lista titulo="" itens={avaliacao.errosDeImportacao} />
                <Lista titulo="" itens={avaliacao.problemasDeCatalogo} />
                {avaliacao.tituloLongo && <p className="text-sm text-slate-800 dark:text-slate-200">{frasesDoTituloLongo()}</p>}
                <Lista titulo={itensDePendencia.length === 1 ? '1 pendência do padrão' : `${itensDePendencia.length} pendências do padrão`} itens={itensDePendencia} />
              </div>
            )}

            {previa && previa.identico && (
              <p id="atualizar-identico" className="p-3 rounded-xl border border-slate-300 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200">
                O arquivo é igual ao material que está no ar: não há nada a atualizar.
              </p>
            )}

            {previa && !previa.identico && (
              <div id="atualizar-previa" className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-3">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>Arquivo aceito. Veja o que vai mudar se a revisão aprovar:</span>
                </p>
                <Lista titulo="Campos do material" itens={previa.campos.map((c) => `${c.campo}: “${c.de || '—'}” → “${c.para || '—'}”`)} />
                <Lista titulo="Seções novas" itens={previa.secoes.novas} />
                <Lista titulo="Seções alteradas" itens={previa.secoes.alteradas} />
                <Lista titulo="Seções removidas" itens={previa.secoes.removidas} />
                {previa.secoes.reordenadas && <p className="text-sm text-slate-800 dark:text-slate-200">A ordem das seções mudou.</p>}
                <Lista titulo="Referências novas" itens={previa.referencias.novas} />
                <Lista titulo="Referências removidas" itens={previa.referencias.removidas} />
                {previa.referencias.ordemMudou && <p className="text-sm text-slate-800 dark:text-slate-200">A ordem das referências mudou.</p>}
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {previa.secoes.iguais} {previa.secoes.iguais === 1 ? 'seção continua igual' : 'seções continuam iguais'}.
                </p>
                {previa.questoesEmSecoesQueSomem > 0 && (
                  <p id="atualizar-aviso-questoes" className="text-sm text-amber-900 dark:text-amber-300">
                    {previa.questoesEmSecoesQueSomem === 1
                      ? '1 questão aponta para uma seção que vai sumir: ela continua ligada ao material, mas deixa de apontar para a seção.'
                      : `${previa.questoesEmSecoesQueSomem} questões apontam para seções que vão sumir: elas continuam ligadas ao material, mas deixam de apontar para a seção.`}
                  </p>
                )}
              </div>
            )}

            {erro && (
              <p id="atualizar-erro" role="alert" className="p-3 rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 text-sm text-rose-900 dark:text-rose-200">
                {erro}
              </p>
            )}
            {enviado && (
              <p id="atualizar-sucesso" className="p-3 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 text-sm text-emerald-900 dark:text-emerald-200">
                Atualização enviada para revisão. O material continua como está até a revisão aprovar; acompanhe em “Meus envios”.
              </p>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-[#243452] flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={botaoClass}>
            Fechar
          </button>
          <button
            type="button"
            id="btn-enviar-atualizacao"
            onClick={enviar}
            disabled={!previa || previa.identico || enviando}
            className="min-h-11 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:dark:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold cursor-pointer"
          >
            {enviando ? 'Enviando…' : 'Enviar atualização para revisão'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const AtualizarMaterial: React.FC<AtualizarMaterialProps> = ({ compendium, disciplines, themes }) => {
  // O leitor é reaproveitado ao navegar entre materiais: a resposta só vale para o material perguntado.
  const [pode, setPode] = useState<{ materialId: string; valor: boolean } | null>(null);
  const [aberto, setAberto] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [baixado, setBaixado] = useState('');

  useEffect(() => {
    let ativo = true;
    setAberto(false);
    setAvisos([]);
    setBaixado('');
    // Decorativo: se a pergunta falhar, os botões simplesmente não aparecem.
    materialSubmissionsRepository
      .podeAtualizar(compendium.id)
      .then((valor) => ativo && setPode({ materialId: compendium.id, valor }))
      .catch(() => ativo && setPode({ materialId: compendium.id, valor: false }));
    return () => {
      ativo = false;
    };
  }, [compendium.id]);

  if (!pode || pode.materialId !== compendium.id || !pode.valor) return null;

  const exportar = () => {
    const r = exportarMaterialParaMarkdown(compendium, disciplines, themes);
    baixarArquivoDeTexto(r.nomeDoArquivo, r.texto);
    setAvisos(r.avisos);
    setBaixado(r.nomeDoArquivo);
  };

  return (
    <div data-testid="atualizar-material" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" id="btn-exportar-material" onClick={exportar} className={botaoClass}>
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Exportar .md</span>
        </button>
        <button type="button" id="btn-atualizar-material" onClick={() => setAberto(true)} className={botaoClass}>
          <FileUp className="w-4 h-4" aria-hidden="true" />
          <span>Atualizar a partir de arquivo</span>
        </button>
      </div>
      {baixado && (
        <p id="exportar-resultado" role="status" className="text-xs text-slate-600 dark:text-slate-300">
          Arquivo “{baixado}” gerado.
        </p>
      )}
      {avisos.length > 0 && (
        <ul id="exportar-avisos" className="list-disc pl-5 text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {aberto && <Dialogo compendium={compendium} disciplines={disciplines} themes={themes} onClose={() => setAberto(false)} />}
    </div>
  );
};
