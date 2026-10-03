-- ============================================================================
-- 44-F — Agendamento do revisor de IA (migration 20261003120600)
--
-- Prova que a migration agenda um único job `revisar-envios` a cada 5 minutos,
-- que rodá-la de novo não duplica o job, e que o disparo sem os segredos do
-- Vault não faz nada (nenhuma chamada HTTP enfileirada) nem dá erro.
-- ============================================================================

create extension if not exists pgtap;

select plan(9);

select is(
  (select count(*) from cron.job where jobname = 'revisar-envios'),
  1::bigint,
  'a migration agendou o job revisar-envios'
);
select is(
  (select schedule from cron.job where jobname = 'revisar-envios'),
  '*/5 * * * *',
  'o job roda a cada 5 minutos'
);
select ok(
  (select command from cron.job where jobname = 'revisar-envios') like '%app.disparar_revisao()%',
  'o job chama app.disparar_revisao()'
);
select is((select count(*) from cron.job), 1::bigint, 'não há outro job além do revisor');

-- Rodar o agendamento da migration 2 vezes (a 1ª vez já foi o `db reset`).
-- O `supabase test db` só enxerga a pasta de testes, não a das migrations: o bloco abaixo é
-- idêntico ao da migration (tests/unit/agendarRevisor44f.test.ts confere que continua igual).
-- inicio-do-bloco-da-migration
do $$
begin
  if exists (select 1 from cron.job where jobname = 'revisar-envios') then
    perform cron.unschedule('revisar-envios');
  end if;
  perform cron.schedule('revisar-envios', '*/5 * * * *', $cmd$select app.disparar_revisao()$cmd$);
end;
$$;
-- fim-do-bloco-da-migration
do $$
begin
  if exists (select 1 from cron.job where jobname = 'revisar-envios') then
    perform cron.unschedule('revisar-envios');
  end if;
  perform cron.schedule('revisar-envios', '*/5 * * * *', $cmd$select app.disparar_revisao()$cmd$);
end;
$$;

select is(
  (select count(*) from cron.job where jobname = 'revisar-envios'),
  1::bigint,
  'rodar a migration de novo deixa um único job (idempotente)'
);
select is(
  (select schedule from cron.job where jobname = 'revisar-envios'),
  '*/5 * * * *',
  'depois de rodar de novo, o job continua a cada 5 minutos'
);

-- Sem os segredos, o disparo não faz nada.
select is(
  (select count(*) from vault.decrypted_secrets where name in ('revisor_url', 'revisor_segredo')),
  0::bigint,
  'o banco local não tem os segredos do revisor no Vault'
);
create temp table antes_disparo as select count(*) as n from net.http_request_queue;
select lives_ok($$ select app.disparar_revisao() $$, 'sem os segredos do Vault, o disparo não dá erro');
select is(
  (select count(*) from net.http_request_queue),
  (select n from antes_disparo),
  'sem os segredos do Vault, o disparo não enfileira chamada nenhuma'
);

select * from finish();
