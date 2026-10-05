import React, { useEffect, useRef, useState } from 'react';
import { EditorVisualCarregavel } from '../editor/EditorVisualCarregavel';
import { SafeMarkdown, parseInline } from '../common/SafeMarkdown';
import { textoEhSeguroParaEditorVisual, type ModoDoTexto } from '../../utils/editorVisualMarkdown';
import { textoParaAbrirNoEditorVisual } from './normalizacaoDoTexto';

// Um campo de texto da seção editada na página de leitura (ED-2). Abre no editor visual, já formatado, quando o texto é
// seguro para ele (ida e volta byte a byte idêntica: AGENTS.md, item 21). Quando não é, abre no mesmo lugar num editor
// de texto simples, com a prévia ao vivo pela tipografia real do leitor, e — se existir uma versão do texto que o editor
// visual aceita E que o leitor mostra igual — oferece "Abrir no editor visual". A troca só vale se a pessoa salvar.

export const FRASE_EDITANDO_COMO_TEXTO = 'Este trecho tem uma formatação que o editor visual não reconhece; editando como texto.';

export interface CampoDeTextoProps {
  /** Identificador curto do campo (para os testes e para ligar rótulo e dica). */
  id: string;
  /** Nome do campo, como a pessoa o lê. */
  rotulo: string;
  /** O que o campo guarda, como está no material. O campo o abre uma vez; para outro texto, troque a `key`. */
  inicial: string;
  modo: ModoDoTexto;
  /** Chamado a cada edição com o texto de agora e se o editor garante que o leitor mostra o mesmo que ele. */
  aoMudar: (texto: string, fiel: boolean) => void;
}

/** Quanto tempo esperar sem digitar antes de conferir se o texto pode ir para o editor visual. */
const ESPERA_DA_CONFERENCIA_MS = 300;

export const CampoDeTexto: React.FC<CampoDeTextoProps> = ({ id, rotulo, inicial, modo, aoMudar }) => {
  const [visual, setVisual] = useState(() => textoEhSeguroParaEditorVisual(inicial, modo));
  // O texto com que o editor visual (re)abre. Muda só ao "Abrir no editor visual".
  const [textoDoVisual, setTextoDoVisual] = useState(inicial);
  const [chaveDoVisual, setChaveDoVisual] = useState(0);
  const [valor, setValor] = useState(inicial);
  // A oferta vale para UM texto: se a caixa mudou desde a conferência, a oferta antiga some (nunca se troca por um texto velho).
  const [oferta, setOferta] = useState<{ para: string; texto: string } | null>(null);

  const aoMudarRef = useRef(aoMudar);
  useEffect(() => {
    aoMudarRef.current = aoMudar;
  }, [aoMudar]);

  useEffect(() => {
    if (visual) return;
    let ativo = true;
    const espera = setTimeout(() => {
      textoParaAbrirNoEditorVisual(valor, modo).then(
        (texto) => ativo && setOferta(texto === null ? null : { para: valor, texto }),
        () => ativo && setOferta(null)
      );
    }, ESPERA_DA_CONFERENCIA_MS);
    return () => {
      ativo = false;
      clearTimeout(espera);
    };
  }, [visual, valor, modo]);

  const abrirNoEditorVisual = (texto: string) => {
    setTextoDoVisual(texto);
    setValor(texto);
    setChaveDoVisual((c) => c + 1);
    setVisual(true);
    aoMudarRef.current(texto, true);
  };

  if (visual) {
    return (
      <EditorVisualCarregavel
        key={chaveDoVisual}
        texto={textoDoVisual}
        modo={modo}
        rotulo={rotulo}
        onChange={(texto, info) => {
          setValor(texto);
          aoMudar(texto, info.fiel);
        }}
        onNaoSeguro={() => setVisual(false)}
      />
    );
  }

  const ofertaValida = oferta !== null && oferta.para === valor ? oferta : null;
  return (
    <div className="space-y-2" data-testid={`campo-em-texto-${id}`}>
      <p className="text-xs text-amber-800 dark:text-amber-300" role="status">
        {FRASE_EDITANDO_COMO_TEXTO}
      </p>
      {ofertaValida && (
        <button
          type="button"
          onClick={() => abrirNoEditorVisual(ofertaValida.texto)}
          className="min-h-11 sm:min-h-9 px-3 py-1.5 rounded-lg border border-teal-600 dark:border-teal-500 text-teal-800 dark:text-teal-300 text-xs font-semibold hover:bg-teal-50 dark:hover:bg-teal-950/40 cursor-pointer"
          title="Troca para o editor já formatado. O texto só muda se você salvar."
        >
          Abrir no editor visual
        </button>
      )}
      <textarea
        aria-label={rotulo}
        value={valor}
        rows={modo === 'linha' ? 2 : 8}
        onChange={(e) => {
          setValor(e.target.value);
          aoMudar(e.target.value, true);
        }}
        className="w-full p-3 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0F172A] text-sm font-mono text-[#172033] dark:text-[#E5E7EB] focus:outline-hidden focus:ring-2 focus:ring-teal-500"
      />
      <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">Prévia: assim este trecho aparece no leitor.</p>
      <div
        data-testid={`previa-do-leitor-${id}`}
        className="rounded-lg border border-dashed border-[#CBD5E1] dark:border-[#334155] p-3 text-[#172033] dark:text-[#E5E7EB]"
      >
        {modo === 'linha' ? (
          <p className="text-sm leading-relaxed">{parseInline(valor)}</p>
        ) : (
          <div className="text-[17px] leading-[1.7]">
            <SafeMarkdown content={valor} />
          </div>
        )}
      </div>
    </div>
  );
};
