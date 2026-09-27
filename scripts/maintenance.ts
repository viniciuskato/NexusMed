/**
 * Limpeza de conteúdo semeado por scripts de manutenção (service_role).
 *
 * Desde a 45-D a exclusão comum de material é recusada quando ele está
 * publicado, tem trilha de revisão, dado de aluno ou ligações — inclusive para
 * service_role. Os scripts que semeiam material usam o caminho explícito
 * `delete_material_maintenance`, que só service_role pode chamar, e nunca
 * engolem o erro: se a limpeza falhar contra o remoto, material de teste
 * publicado ficaria visível para os estudantes.
 */

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
}

export async function deleteSeededMaterial(client: RpcClient, materialId: string): Promise<void> {
  const { error } = await client.rpc('delete_material_maintenance', { p_material_id: materialId });
  if (error) {
    throw new Error(`não foi possível apagar o material semeado ${materialId}: ${error.message}`);
  }
}
