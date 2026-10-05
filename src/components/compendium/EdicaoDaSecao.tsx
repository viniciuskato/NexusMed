import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import type { CompendiumSection, CompendiumSectionSnapshot } from '../../types';
import { materialsRepository } from '../../repositories/MaterialsRepository';
import { CampoDeTexto } from './CampoDeTexto';
import { mudancasDaSecao, valoresIniciais, type ValoresEditados } from './mudancasDaSecao';

// Edição de uma seção direto na página de leitura (ED-2): no lugar da leitura da seção, o título (texto simples), o texto
// principal, os Pontos-chave, a Pérola clínica e o Alerta de armadilha, cada um no editor visual quando o texto é seguro
// para ele, e "Salvar" / "Cancelar". Grava pela mesma função do editor da Área Editorial (`updateSectionContent`, que
// registra versão em `material_section_versions`), mandando só os campos que mudaram. Só o admin chega aqui (quem decide
// é o leitor); a gravação continua protegida no servidor.

export const MOTIVO_DA_EDICAO_NA_LEITURA = 'Edição na página de leitura';
export const PERGUNTA_DESCARTAR = 'Descartar as alterações?';

interface EdicaoDaSecaoProps {
  /** A seção como está na tela agora. */
  secao: CompendiumSection;
  /** A gravação deu certo; `salvo` traz só o que mudou. */
  aoSalvar: (salvo: Partial<CompendiumSectionSnapshot>) => void;
  /** Fechou sem gravar (cancelou, ou salvou sem nada ter mudado). */
  aoFechar: (aviso?: string) => void;
}

interface Ponto {
  chave: number;
  valor: string;
}

const classeDoRotulo = 'block text-sm font-semibold text-[#172033] dark:text-[#E5E7EB]';
const classeDaDica = 'text-xs text-[#64748B] dark:text-[#94A3B8] mb-1.5';
const classeDoBotao =
  'min-h-11 sm:min-h-9 px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50';

export const EdicaoDaSecao: React.FC<EdicaoDaSecaoProps> = ({ secao, aoSalvar, aoFechar }) => {
  const idDoTitulo = useId();
  const idDaDicaDoTitulo = useId();
  const inicial = useMemo(() => valoresIniciais(secao), [secao]);

  const [titulo, setTitulo] = useState(inicial.titulo);
  const [conteudo, setConteudo] = useState(inicial.conteudo);
  const proximaChave = useRef(inicial.pontos.length);
  const [pontos, setPontos] = useState<Ponto[]>(() => inicial.pontos.map((valor, chave) => ({ chave, valor })));
  const [perola, setPerola] = useState(inicial.perola);
  const [alerta, setAlerta] = useState(inicial.alerta);
  // Campos em que o editor visual avisou que o leitor não mostraria o mesmo que ele mostra.
  const [infieis, setInfieis] = useState<ReadonlySet<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const marcarFidelidade = (campo: string, fiel: boolean) =>
    setInfieis((atual) => {
      if (fiel === !atual.has(campo)) return atual;
      const proximo = new Set(atual);
      if (fiel) proximo.delete(campo);
      else proximo.add(campo);
      return proximo;
    });

  const valores: ValoresEditados = { titulo, conteudo, pontos: pontos.map((p) => p.valor), perola, alerta };
  const mudancas = mudancasDaSecao(secao, valores);
  const mudou = Object.keys(mudancas).length > 0;

  // Sair da página (fechar a aba, recarregar) com a edição por salvar: o navegador pergunta.
  useEffect(() => {
    if (!mudou) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [mudou]);

  const tituloVazio = titulo.trim() === '';
  const semFidelidade = infieis.size > 0;
  let motivoDeNaoSalvar = '';
  if (semFidelidade) {
    motivoDeNaoSalvar =
      'Salvar está desligado: uma formatação que você aplicou não aparece no leitor do jeito que está no editor (por exemplo, negrito e itálico juntos no trecho inteiro). Veja o aviso no campo e ajuste o trecho.';
  } else if (tituloVazio) {
    motivoDeNaoSalvar = 'Escreva o título da seção para poder salvar.';
  }

  const salvar = async () => {
    if (salvando || motivoDeNaoSalvar) return;
    if (!mudou) {
      aoFechar('Nenhuma alteração para salvar.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await materialsRepository.updateSectionContent(secao.id, mudancas, MOTIVO_DA_EDICAO_NA_LEITURA);
      aoSalvar(mudancas);
    } catch (err) {
      console.error('[EdicaoDaSecao] falha ao salvar a seção:', err);
      setErro('Não foi possível salvar a seção. O que você escreveu continua aqui; confira a conexão e tente de novo.');
      setSalvando(false);
    }
  };

  const cancelar = () => {
    if (salvando) return;
    if (mudou && !window.confirm(PERGUNTA_DESCARTAR)) return;
    aoFechar();
  };

  const adicionarPonto = () => {
    const chave = proximaChave.current++;
    setPontos((atual) => [...atual, { chave, valor: '' }]);
  };

  const removerPonto = (chave: number) => {
    setPontos((atual) => atual.filter((p) => p.chave !== chave));
    marcarFidelidade(`ponto-${chave}`, true);
  };

  return (
    <div
      data-testid="edicao-da-secao"
      role="group"
      aria-label={`Editando a seção ${secao.title}`}
      className="rounded-2xl border-2 border-teal-500/50 dark:border-teal-500/60 bg-white dark:bg-[#111827] p-4 sm:p-6 space-y-6 max-w-full"
    >
      <div data-testid="campo-titulo">
        <label htmlFor={idDoTitulo} className={classeDoRotulo}>
          Título da seção
        </label>
        <p id={idDaDicaDoTitulo} data-dica className={classeDaDica}>
          O título que aparece acima do texto, só texto simples.
        </p>
        <input
          id={idDoTitulo}
          type="text"
          value={titulo}
          aria-describedby={idDaDicaDoTitulo}
          onChange={(e) => setTitulo(e.target.value)}
          className="w-full min-h-11 px-3 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-base font-semibold text-[#172033] dark:text-[#E5E7EB] focus:outline-hidden focus:ring-2 focus:ring-teal-500"
        />
      </div>

      <div data-testid="campo-texto-da-secao">
        <p className={classeDoRotulo}>Texto da seção</p>
        <p data-dica className={classeDaDica}>
          Clique no texto e escreva. Use os botões acima dele para negrito, listas, caixas de destaque e citações.
        </p>
        <CampoDeTexto
          id="texto-da-secao"
          rotulo="Texto da seção"
          inicial={inicial.conteudo}
          modo="secao"
          aoMudar={(texto, fiel) => {
            setConteudo(texto);
            marcarFidelidade('conteudo', fiel);
          }}
        />
      </div>

      <div data-testid="campo-pontos-chave">
        <p className={classeDoRotulo}>Pontos-chave</p>
        <p data-dica className={classeDaDica}>
          Um ponto em cada caixa; eles aparecem em lista no fim da seção. Ponto vazio é descartado ao salvar.
        </p>
        <div className="space-y-3">
          {pontos.map((p, i) => (
            <div key={p.chave} className="space-y-1.5">
              <CampoDeTexto
                id={`ponto-${i + 1}`}
                rotulo={`Ponto-chave ${i + 1}`}
                inicial={p.valor}
                modo="linha"
                aoMudar={(texto, fiel) => {
                  setPontos((atual) => atual.map((x) => (x.chave === p.chave ? { ...x, valor: texto } : x)));
                  marcarFidelidade(`ponto-${p.chave}`, fiel);
                }}
              />
              <button
                type="button"
                onClick={() => removerPonto(p.chave)}
                aria-label={`Remover ponto-chave ${i + 1}`}
                className="min-h-11 sm:min-h-9 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Remover este ponto</span>
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={adicionarPonto}
          aria-label="Adicionar ponto-chave"
          className="mt-3 min-h-11 sm:min-h-9 px-3 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] text-xs font-semibold text-[#172033] dark:text-[#E5E7EB] hover:bg-slate-50 dark:hover:bg-[#182235] flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Adicionar ponto</span>
        </button>
      </div>

      <div data-testid="campo-perola">
        <p className={classeDoRotulo}>Pérola clínica</p>
        <p data-dica className={classeDaDica}>
          Uma dica prática, numa frase só. Aparece na caixa amarela. Deixe vazio para não mostrar.
        </p>
        <CampoDeTexto
          id="perola"
          rotulo="Pérola clínica"
          inicial={inicial.perola}
          modo="linha"
          aoMudar={(texto, fiel) => {
            setPerola(texto);
            marcarFidelidade('perola', fiel);
          }}
        />
      </div>

      <div data-testid="campo-alerta">
        <p className={classeDoRotulo}>Alerta de armadilha</p>
        <p data-dica className={classeDaDica}>
          O erro que a prova ou o plantão costuma provocar, numa frase só. Aparece na caixa vermelha. Deixe vazio para não mostrar.
        </p>
        <CampoDeTexto
          id="alerta"
          rotulo="Alerta de armadilha"
          inicial={inicial.alerta}
          modo="linha"
          aoMudar={(texto, fiel) => {
            setAlerta(texto);
            marcarFidelidade('alerta', fiel);
          }}
        />
      </div>

      {erro && (
        <p role="alert" className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">
          {erro}
        </p>
      )}

      {motivoDeNaoSalvar && (
        <p className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          {motivoDeNaoSalvar}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={cancelar}
          disabled={salvando}
          className={`${classeDoBotao} border border-[#CBD5E1] dark:border-[#334155] text-[#172033] dark:text-[#E5E7EB] hover:bg-slate-50 dark:hover:bg-[#182235]`}
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Cancelar</span>
        </button>
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando || motivoDeNaoSalvar !== ''}
          className={`${classeDoBotao} bg-[#0F766E] hover:bg-teal-800 dark:bg-[#14B8A6] dark:hover:bg-teal-400 text-white dark:text-[#0B1220]`}
        >
          <Save className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{salvando ? 'Salvando…' : 'Salvar'}</span>
        </button>
      </div>
    </div>
  );
};
