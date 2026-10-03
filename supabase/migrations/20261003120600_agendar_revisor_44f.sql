-- ============================================================================
-- 44-F — Agendamento do revisor de IA no banco
--
-- A cada 5 minutos o banco chama app.disparar_revisao() (migration
-- 20261003120100_revisor_ia_44f), que dispara a Edge Function `revisar-envios`.
-- Sem os dois segredos do Vault (`revisor_url` e `revisor_segredo`, que o dono
-- cria uma vez; RUNBOOK 3.3) a função não faz nada e não dá erro: agendar antes
-- dos segredos não gasta um centavo e não deixa o job falhando.
--
-- Idempotente: um único job, `revisar-envios`. Rodar de novo troca o job pelo
-- mesmo job, nunca duplica. Para desligar: select cron.unschedule('revisar-envios');
-- ============================================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'revisar-envios') then
    perform cron.unschedule('revisar-envios');
  end if;
  perform cron.schedule('revisar-envios', '*/5 * * * *', $cmd$select app.disparar_revisao()$cmd$);
end;
$$;
