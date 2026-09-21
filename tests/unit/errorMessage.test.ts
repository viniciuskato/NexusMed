import { describe, it, expect } from 'vitest';
import { getErrorMessage, getOptionalErrorMessage } from '../../src/utils/errorMessage';

// PGRST202: código real que o PostgREST devolve quando uma RPC chamada via
// `.rpc()` não existe no schema cache do projeto Supabase de destino —
// achado real ao importar um lote de questões contra um ambiente sem a
// migration da RPC aplicada (ver src/utils/errorMessage.ts).
describe('getErrorMessage', () => {
  it('devolve a mensagem crua de um Error comum', () => {
    expect(getErrorMessage(new Error('falha qualquer'))).toBe('falha qualquer');
  });

  it('devolve a mensagem de um objeto simples (PostgrestError não é instanceof Error)', () => {
    expect(getErrorMessage({ message: 'gabarito inválido' })).toBe('gabarito inválido');
  });

  it('PGRST202 (função ausente do schema cache) vira uma mensagem acionável, sem esconder o detalhe técnico original', () => {
    const err = {
      code: 'PGRST202',
      message:
        'Could not find the function public.import_question_draft(p_clinical_vignette, p_cycle) in the schema cache',
    };
    const result = getErrorMessage(err);
    expect(result).toMatch(/ainda não existe neste ambiente Supabase/);
    expect(result).toMatch(/supabase db reset/);
    expect(result).toContain(err.message);
  });

  it('erro sem `code` PGRST202 continua devolvendo a mensagem original, sem o texto de diagnóstico', () => {
    const result = getErrorMessage({ code: 'PGRST301', message: 'JWT expirado' });
    expect(result).toBe('JWT expirado');
  });

  it('fallback para String(err) quando não há Error nem .message', () => {
    expect(getErrorMessage('texto solto')).toBe('texto solto');
    expect(getErrorMessage(42)).toBe('42');
  });
});

describe('getOptionalErrorMessage', () => {
  it('devolve undefined quando não há .message', () => {
    expect(getOptionalErrorMessage({})).toBeUndefined();
    expect(getOptionalErrorMessage('texto solto')).toBeUndefined();
  });

  it('devolve a mensagem quando presente, sem aplicar o tratamento especial de PGRST202', () => {
    expect(getOptionalErrorMessage({ code: 'PGRST202', message: 'raw' })).toBe('raw');
  });
});
