-- ============================================================================
-- 44-F — Agendamento do revisor de IA (migration 20261003120600) e P6 (20261003120700)
--
-- A 44-F agenda um único job `revisar-envios` a cada 5 minutos (e rodar de novo
-- não duplica); a P6 o desagenda (o revisor agora é feito pela equipe, D-12). Prova
-- os dois blocos, termina com o banco sem o job, e que o disparo sem os segredos
-- do Vault não faz nada (nenhuma chamada HTTP enfileirada) nem dá erro.
-- ============================================================================

create extension if not exists pgtap;

select plan(9);

-- P6 (03/10): a migration 20261003120700 desagenda o job. Depois do `db reset`, não há job nenhum.
select is(
  (select count(*) from cron.job where jobname = 'revisar-envios'),
  0::bigint,
  'a migration da P6 desagendou o job revisar-envios'
);
select is((select count(*) from cron.job), 0::bigint, 'e não há outro job no banco');

-- Rodar o agendamento da migration 44-F 2 vezes (histórico: prova que o bloco é idempotente).
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

-- Bloco da migration da P6, que desfaz o agendamento (deixa o banco como o `db reset` deixa).
-- inicio-do-bloco-da-p6
do $$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'cron')
     and exists (select 1 from cron.job where jobname = 'revisar-envios') then
    perform cron.unschedule('revisar-envios');
  end if;
end;
$$;
-- fim-do-bloco-da-p6
select is(
  (select count(*) from cron.job where jobname = 'revisar-envios'),
  0::bigint,
  'o bloco da P6 desagenda o job'
);
-- Rodar de novo, sem job nenhum: não dá erro.
do $$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'cron')
     and exists (select 1 from cron.job where jobname = 'revisar-envios') then
    perform cron.unschedule('revisar-envios');
  end if;
end;
$$;
select is(
  (select count(*) from cron.job),
  0::bigint,
  'rodar o desagendamento de novo (idempotente) deixa o banco sem job'
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
