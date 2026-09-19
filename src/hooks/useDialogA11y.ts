import { useEffect, useRef, type RefObject } from 'react';

// ============================================================================
// Acessibilidade de diálogos modais (AUD-09).
//
// Uso: `const ref = useDialogA11y<HTMLDivElement>({ isOpen, onClose });` e
// `<div ref={ref} role="dialog" aria-modal="true" aria-labelledby="...">`.
//
// Enquanto aberto:
// - foco inicial em `initialFocusRef`, senão no primeiro elemento focável do
//   diálogo (se o foco já estiver dentro dele, não mexe);
// - Tab/Shift+Tab ficam presos dentro do diálogo;
// - Escape chama `onClose` (só se informado — sem onClose, Escape é ignorado);
// - ao fechar/desmontar, o foco volta ao elemento que estava focado antes.
//
// Com diálogos empilhados, só o mais recente (topo da pilha) reage a teclas.
// `onClose` é lido por ref: trocar a identidade dele a cada render não
// reinstala o efeito nem move o foco.
// ============================================================================

export interface UseDialogA11yOptions {
  /** Padrão `true` — para diálogos que só são montados quando abertos. */
  isOpen?: boolean;
  onClose?: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]',
].join(', ');

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.tabIndex >= 0 && !el.closest('[hidden], [inert]')
  );
}

// Pilha de diálogos abertos (ids), para só o do topo tratar teclado.
const openDialogs: symbol[] = [];

export function useDialogA11y<T extends HTMLElement>(options: UseDialogA11yOptions = {}): RefObject<T | null> {
  const { isOpen = true, onClose, initialFocusRef } = options;
  const containerRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const initialFocusRefRef = useRef(initialFocusRef);

  useEffect(() => {
    onCloseRef.current = onClose;
    initialFocusRefRef.current = initialFocusRef;
  });

  useEffect(() => {
    if (!isOpen) return;

    const id = Symbol('dialog');
    openDialogs.push(id);
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const container = containerRef.current;
    if (container && !container.contains(document.activeElement)) {
      const target = initialFocusRefRef.current?.current ?? getFocusable(container)[0] ?? container;
      target.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== id) return;
      const el = containerRef.current;
      if (!el) return;

      if (e.key === 'Escape') {
        if (!onCloseRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== 'Tab') return;
      const focusable = getFocusable(el);
      if (focusable.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!el.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const idx = openDialogs.indexOf(id);
      if (idx >= 0) openDialogs.splice(idx, 1);
      if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, [isOpen]);

  return containerRef;
}
