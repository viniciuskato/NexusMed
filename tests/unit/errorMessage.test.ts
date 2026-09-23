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

describe('getErrorMessage — integridade da árvore de materiais', () => {
  it('traduz FK de material-pai em qual realocação desbloqueia a exclusão', () => {
    const result = getErrorMessage({
      code: '23503',
      message:
        'update or delete on table "materials" violates foreign key constraint "materials_parent_material_id_fkey" on table "materials"',
    });
    expect(result).toContain('materiais-filhos');
    expect(result).not.toContain('foreign key');
  });

  it('traduz FK de destino de ligação', () => {
    const result = getErrorMessage({
      code: '23503',
      message: 'violates foreign key constraint "material_links_target_fkey"',
    });
    expect(result).toContain('Estude antes');
  });

  // O nome da constraint chega em `details`, não em `message`, quando o
  // PostgREST separa os dois — a tradução tem que olhar os dois campos.
  it('encontra a constraint quando ela vem em details', () => {
    const result = getErrorMessage({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      details: 'Key (...) already exists in "material_links_pair_unique"',
    });
    expect(result).toContain('nunca os dois ao mesmo tempo');
  });

  it('não interfere em erro sem constraint conhecida', () => {
    expect(getErrorMessage({ code: '23503', message: 'outra constraint qualquer' })).toBe(
      'outra constraint qualquer',
    );
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
