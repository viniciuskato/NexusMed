import React, { useRef, useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useDialogA11y } from '../../src/hooks/useDialogA11y';

// AUD-09: contrato do hook de acessibilidade de diálogos modais —
// foco inicial, Tab/Shift+Tab presos no diálogo, Escape fecha (quando há
// onClose) e o foco volta ao elemento que abriu o diálogo ao fechar.

afterEach(cleanup);

interface DialogProps {
  onClose?: () => void;
  withInitialFocus?: boolean;
}

const Dialog: React.FC<DialogProps> = ({ onClose, withInitialFocus }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useDialogA11y<HTMLDivElement>({
    onClose,
    initialFocusRef: withInitialFocus ? inputRef : undefined,
  });
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="t">
      <h2 id="t">Título</h2>
      <button type="button">Primeiro</button>
      <input ref={inputRef} aria-label="Campo" />
      <button type="button" disabled>
        Desabilitado
      </button>
      <button type="button">Último</button>
    </div>
  );
};

const Harness: React.FC<{ withEscape?: boolean; withInitialFocus?: boolean }> = ({
  withEscape = true,
  withInitialFocus,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Fechar por fora
      </button>
      {open && (
        <Dialog onClose={withEscape ? () => setOpen(false) : undefined} withInitialFocus={withInitialFocus} />
      )}
    </div>
  );
};

function openDialog() {
  const trigger = screen.getByRole('button', { name: 'Abrir' });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe('useDialogA11y', () => {
  it('foca o primeiro elemento focável ao abrir', () => {
    render(<Harness />);
    openDialog();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Primeiro' }));
  });

  it('respeita initialFocusRef quando informado', () => {
    render(<Harness withInitialFocus />);
    openDialog();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Campo' }));
  });

  it('Tab no último elemento volta ao primeiro; Shift+Tab no primeiro vai ao último (ignora desabilitados)', () => {
    render(<Harness />);
    openDialog();
    const first = screen.getByRole('button', { name: 'Primeiro' });
    const last = screen.getByRole('button', { name: 'Último' });

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('Tab com o foco fora do diálogo traz o foco de volta para dentro', () => {
    render(<Harness />);
    openDialog();
    const outside = screen.getByRole('button', { name: 'Fechar por fora' });
    outside.focus();
    fireEvent.keyDown(outside, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Primeiro' }));
  });

  it('Escape chama onClose e o foco volta ao gatilho', () => {
    render(<Harness />);
    const trigger = openDialog();
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('sem onClose, Escape não faz nada', () => {
    render(<Harness withEscape={false} />);
    openDialog();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('com dois diálogos abertos, só o de cima reage ao Escape', () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    render(
      <>
        <Dialog onClose={outerClose} />
        <Dialog onClose={innerClose} />
      </>
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
  });

  it('não reinstala o efeito (nem rouba o foco) quando onClose muda de identidade', () => {
    const Rerendering: React.FC = () => {
      const [n, setN] = useState(0);
      const ref = useDialogA11y<HTMLDivElement>({ onClose: () => setN(n + 1) });
      return (
        <div ref={ref} role="dialog">
          <button type="button">A{n}</button>
          <button type="button" onClick={() => setN(n + 1)}>
            B
          </button>
        </div>
      );
    };
    render(<Rerendering />);
    const b = screen.getByRole('button', { name: 'B' });
    b.focus();
    act(() => {
      fireEvent.click(b);
    });
    expect(document.activeElement).toBe(b);
  });

  it('isOpen=false não mexe no foco nem escuta teclas', () => {
    const onClose = vi.fn();
    const Closed: React.FC = () => {
      const ref = useDialogA11y<HTMLDivElement>({ isOpen: false, onClose });
      return (
        <div ref={ref}>
          <button type="button">X</button>
        </div>
      );
    };
    render(<Closed />);
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
