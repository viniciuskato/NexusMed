// 45-H (AUD-32.4) — o PostgREST devolve sucesso num UPDATE que não atinge
// nenhuma linha (id que não existe, ou linha que a RLS não deixa alterar). Quem
// grava pede as linhas de volta (`.select('id')`) e passa o resultado aqui: sem
// linha, é erro. A mensagem cai em "validation" no `classifySyncError` (falha
// permanente e visível), nunca em nova tentativa infinita.

export function exigirLinhaAtualizada(linhas: unknown[] | null | undefined, o_que: string): void {
  if (!linhas || linhas.length === 0) {
    throw new Error(`${o_que}: linha não encontrada ou sem permissão — nada foi atualizado.`);
  }
}
