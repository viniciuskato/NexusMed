# Mapa da documentação

Onde está cada coisa em `docs/`. Agente de IA começa pelo
[`AGENTS.md`](../AGENTS.md), que diz o que ler e em que ordem.

## Quero…

| Quero… | Abra |
|---|---|
| saber o que está sendo construído, em que ordem e em que estado | [`produto/PLANO-DE-DESENVOLVIMENTO.md`](produto/PLANO-DE-DESENVOLVIMENTO.md) |
| ver as decisões que só o dono do produto toma, e as métricas | [`produto/PRODUTO.md`](produto/PRODUTO.md), [`produto/METRICAS.md`](produto/METRICAS.md) |
| saber por que algo foi decidido | [`operacao/DECISIONS.md`](operacao/DECISIONS.md) |
| ver o estado da produção e do Supabase, e os riscos abertos | [`operacao/PROJECT_STATE.md`](operacao/PROJECT_STATE.md) |
| ver pendências que não são unidades do plano | [`operacao/TASKS.md`](operacao/TASKS.md) |
| publicar, reverter, testar, abrir ou fechar uma sessão | [`operacao/RUNBOOK.md`](operacao/RUNBOOK.md), [`operacao/SESSION_PROTOCOL.md`](operacao/SESSION_PROTOCOL.md) |
| saber o que já deu errado e como se evita | [`operacao/incidents/index.md`](operacao/incidents/index.md) |
| escrever um material, ou entregar a uma IA que escreva | [`editorial/PADRAO-NEXUSMED-CONTEUDOS.md`](editorial/PADRAO-NEXUSMED-CONTEUDOS.md) |
| escrever uma questão comentada | [`editorial/PADRAO-NEXUSMED-QUESTOES.md`](editorial/PADRAO-NEXUSMED-QUESTOES.md) |
| ver o que produzir de antimicrobianos, e em que ordem | [`editorial/PLANO-ANTIMICROBIANOS.md`](editorial/PLANO-ANTIMICROBIANOS.md) |
| ver ideias de temas para depois | [`editorial/BANCO-EDITORIAL-TEMAS-FUTUROS.md`](editorial/BANCO-EDITORIAL-TEMAS-FUTUROS.md) |
| produzir conteúdo com o Gemini agora | `conteúdos/LEIA-ME.md` (só no seu computador) |
| entender os papéis: diretoria, trilhas e auditoria | [`diretoria/MODELO-DIRETORIA.md`](diretoria/MODELO-DIRETORIA.md) |
| ver o que a auditoria propôs | [`diretoria/BACKLOG-ESTRATEGICO.md`](diretoria/BACKLOG-ESTRATEGICO.md) |
| achar algo antigo | [`archive/`](archive/) |

## As pastas

```text
docs/
├── LEIA-ME.md   este mapa
├── produto/     o que construir e por quê
├── operacao/    como executar com segurança: estado, decisões, fila,
│                runbook; standards/, incidents/ e runbooks/
├── editorial/   regras e planos de conteúdo
│   └── acervo/  material já escrito (ácido-base, meningite) e as
│                planilhas de auditoria
├── diretoria/   como a diretoria trabalha; PLANO-AUD-04 ainda serve à 46-A
├── conteúdos/   mesa de trabalho da produção de conteúdo; fora do git,
│                porque as fontes têm direito autoral
└── archive/     histórico; ninguém edita
```

## Caminhos antigos

Em 25/09/2026 o histórico saiu do meio dos documentos em uso. Documentos
antigos, comentários no código e PRs anteriores citam os caminhos de antes:

| Antes | Agora |
|---|---|
| `docs/architecture/` | `docs/archive/architecture/` |
| `docs/diretoria/registro.md`, `prompts/` e `retornos/` | `docs/archive/diretoria/` |
| `docs/diretoria/` — relatórios de 17 a 21/09 (`AS1-*`, `AUDITORIA-*`, `CHECKLIST-*`, `INSIGHTS-*`) e `baseline-transicao-2026-09-08.txt` | `docs/archive/diretoria/` |
| `docs/operacao/ROTEIRO-AS1-ACIDOBASE.md` | `docs/archive/operacao/` |
| `docs/editorial/as1/`, `docs/editorial/infectologia-clinica/` e os dois `.csv` de `docs/editorial/` | `docs/editorial/acervo/` |

O texto do histórico não foi reescrito: ele cita os caminhos da época. Só os
links clicáveis foram corrigidos.
