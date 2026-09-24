import React from 'react';
import { splitHighlight } from '../../utils/searchHighlight';

interface HighlightedTextProps {
  /** Texto com os marcadores de destaque da busca (ver utils/searchHighlight). */
  text: string | null | undefined;
  className?: string;
}

/**
 * Renderiza o texto marcado pela busca: cada pedaço é um nó de texto do React
 * (escapado), os destacados dentro de <mark>. Nunca interpreta HTML.
 */
export const HighlightedText: React.FC<HighlightedTextProps> = ({ text, className }) => (
  <span className={className}>
    {splitHighlight(text).map((segment, idx) =>
      segment.highlighted ? (
        <mark
          key={idx}
          className="rounded-sm bg-amber-200/80 dark:bg-amber-400/30 text-inherit px-0.5"
        >
          {segment.text}
        </mark>
      ) : (
        <React.Fragment key={idx}>{segment.text}</React.Fragment>
      )
    )}
  </span>
);
