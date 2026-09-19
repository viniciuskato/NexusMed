# METRICAS.md — linha de base e acompanhamento semanal

Uma linha por semana, sempre gerada por
[`scripts/sql/metricas-semanais.sql`](../../scripts/sql/metricas-semanais.sql)
(somente leitura):

```
supabase db query --linked -f scripts/sql/metricas-semanais.sql
```

(ou colar o conteúdo do arquivo no SQL Editor do Supabase). Precisa de acesso
ao projeto `synapsemed`, que hoje só a conta do dono do projeto tem.

**Como ler**: `ativos_7d` estudou (questão ou flashcard) nos últimos 7 dias;
`ativos_7d_anterior`, na semana anterior. Sinais de alerta: `ativos_7d`
caindo semana a semana, ou `materiais_publicados` parado enquanto o código
cresce. `estudantes_ativos_cadastrados` inclui admins.

| Data | Cadastrados ativos | Pendentes | Ativos 7d | Ativos 7d ant. | Questões 7d | Acerto 7d | Revisões de cards 7d | Materiais publ./rasc. | Questões publ./rasc. | Observação |
|---|---|---|---|---|---|---|---|---|---|---|
| _(primeira leitura: antes da prova AS1 de 21/09)_ | | | | | | | | | | |
