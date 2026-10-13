export type Etapa = 'typecheck' | 'lint' | 'unit' | 'pgTAP' | 'build' | 'debug-bundle';

export const ETAPAS: Etapa[];
/** Total de testes da saída do vitest, ou "?" se não achar. */
export function contarTestesUnit(saida: string): string;
/** Total de testes da saída do `supabase test db`, ou "?" se não achar. */
export function contarTestesPgtap(saida: string): string;
export function linhaDeSucesso(unit: string, pgtap: string): string;
export function linhaDeFalha(etapa: Etapa): string;
