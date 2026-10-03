// Quem pode chamar a função `revisar-envios` (44-F): só o agendador do banco, com
// o segredo REVISOR_SEGREDO no cabeçalho Authorization. Sem segredo configurado,
// ninguém entra. Nada aqui depende de Deno, para o teste rodar em Node.

const codificador = new TextEncoder();

/** Comparação em tempo constante do cabeçalho com o segredo esperado. */
export function segredoConfere(recebido: string | null, esperado: string): boolean {
  const a = codificador.encode(recebido ?? '');
  const b = codificador.encode(`Bearer ${esperado}`);
  let diferenca = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) diferenca |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diferenca === 0;
}

export interface AmbienteDaFuncao {
  REVISOR_SEGREDO?: string;
  ANTHROPIC_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export type Portaria = { ok: true } | { ok: false; status: number; erro: string };

/** Confere método, segredo e ambiente, nesta ordem, antes de qualquer trabalho. */
export function verificarChamada(
  chamada: { metodo: string; authorization: string | null },
  ambiente: AmbienteDaFuncao,
): Portaria {
  if (!ambiente.REVISOR_SEGREDO) return { ok: false, status: 500, erro: 'função sem REVISOR_SEGREDO configurado' };
  if (chamada.metodo !== 'POST') return { ok: false, status: 405, erro: 'método não permitido' };
  if (!segredoConfere(chamada.authorization, ambiente.REVISOR_SEGREDO)) {
    return { ok: false, status: 401, erro: 'não autorizado' };
  }
  if (!ambiente.ANTHROPIC_API_KEY) return { ok: false, status: 500, erro: 'função sem ANTHROPIC_API_KEY configurada' };
  if (!ambiente.SUPABASE_URL || !ambiente.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, erro: 'função sem acesso ao Supabase' };
  }
  return { ok: true };
}

export async function sha256Hex(texto: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', codificador.encode(texto));
  return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, '0')).join('');
}
