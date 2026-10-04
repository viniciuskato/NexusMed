import React, { Suspense } from 'react';
import type { EditorVisualDeSecaoProps } from './tipos';

// O que o resto do app importa para usar o editor visual. A biblioteca do editor (TipTap/ProseMirror) só é baixada
// quando este componente é montado: o `import()` abaixo vira um pedaço (chunk) separado do pacote inicial.
// Nenhum outro arquivo fora de `src/components/editor/` pode importar `@tiptap/*` nem `EditorVisualDeSecao` direto
// (conferido por `tests/unit/editorVisualPacote.test.ts`).

const EditorVisualDeSecao = React.lazy(() => import('./EditorVisualDeSecao'));

export const EditorVisualCarregavel: React.FC<EditorVisualDeSecaoProps> = (props) => (
  <Suspense fallback={<p role="status">Abrindo o editor…</p>}>
    <EditorVisualDeSecao {...props} />
  </Suspense>
);
