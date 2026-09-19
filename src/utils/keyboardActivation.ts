import type React from 'react';

/**
 * `onKeyDown` para elementos clicáveis que não podem virar `<button>` (ex.:
 * cartões que já contêm botões internos — botão dentro de botão é HTML
 * inválido). Usar junto com `role="button"` e `tabIndex={0}`.
 *
 * - Enter/Espaço ativam, como num botão nativo.
 * - Só reage quando o próprio elemento tem o foco (`target === currentTarget`):
 *   Enter/Espaço num botão interno continuam sendo só daquele botão.
 * - `preventDefault` evita rolar a página no Espaço; `stopPropagation` evita
 *   que atalhos globais em `window` (ex.: Espaço vira o flashcard, Enter
 *   confirma a questão) processem a mesma tecla uma segunda vez.
 */
export function onActivationKey(action: () => void) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      action();
    }
  };
}
