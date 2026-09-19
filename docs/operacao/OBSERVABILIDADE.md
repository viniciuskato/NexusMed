# OBSERVABILIDADE.md — erros do navegador dos estudantes

Desde o NOVO-02 (2026-09-18), erros no navegador de quem está logado vão para
`public.client_errors` via RPC `log_client_error`:

- `error`: exceção não tratada (`window` `error`);
- `unhandledrejection`: promessa rejeitada sem tratamento;
- `boundary`: tela que falhou ao abrir (`AppErrorBoundary`), inclusive o
  arquivo da tela ausente depois de um deploy (NOVO-01).

Guarda: tipo, mensagem (até 1000 caracteres), stack (até 8000), rota
sanitizada (só `/#/tela` — query string e tokens da URL nunca saem), commit do
build (`release`) e user agent. No máximo 10 erros distintos por sessão do
navegador e 50 por usuário por hora. Sem sessão, nada é enviado. Só admin lê.

## Olhar os erros (SQL Editor do Supabase, conta admin do projeto)

```sql
-- Últimos 7 dias, agrupados
select kind, message, release, count(*) as vezes, count(distinct user_id) as pessoas,
       max(created_at) as ultima
from public.client_errors
where created_at > now() - interval '7 days'
group by kind, message, release
order by vezes desc
limit 50;

-- Detalhe de um erro
select created_at, url, release, user_agent, stack
from public.client_errors
where message = '<cole a mensagem>'
order by created_at desc
limit 5;
```

Rotina sugerida: olhar uma vez por semana, junto com as métricas, e sempre
depois de um deploy grande. Erro novo que aparece logo após um `release` =
provável regressão desse deploy.

## Retenção (LGPD)

Manter no máximo 90 dias. Apagar manualmente:

```sql
delete from public.client_errors where created_at < now() - interval '90 days';
```

A linha é apagada junto com a conta do usuário (`on delete cascade`).
