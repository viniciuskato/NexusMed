# Estado atual — NexusMed

Atualizado em: 2026-09-12

## Sessão ativa

| ID | Estado | Objetivo | Código |
|---|---|---|---|
| 13-B | EM_EXECUCAO | Completar concorrência/SRS/simulado, validar CI real e publicar a suíte | `work/13a-suite-critica`, base conhecida `4bf8dce` |

## Aguardando diretoria

- Reorganização “Estudo Temático / packs”: executada no Google AI Studio, com tela vazia relatada; correção orientada, ainda sem retorno Git verificável.

## Próximos candidatos

| Ordem | ID | Estado | Gate |
|---:|---|---|---|
| 1 | 18-A | PLANEJADA | retorno e decisão do 13-B |
| 2 | 19-A | PLANEJADA | fundação de testes publicada |
| 3 | 14-A | PLANEJADA | testes publicados e conflitos reconciliados |
| 4 | 15-A | PLANEJADA | testes publicados |
| 5 | 16-A | PLANEJADA | testes publicados |
| 6 | 21-A2 | PLANEJADA | auditoria somente leitura; substitui 21-A |
| 7 | 20-A | CONDICIONAL | valor atual da carga YAML |
| 8 | 17-A | ADIADA | decisão estratégica de offline |

## Marcos aceitos

- 12-B: PUBLICADA; `main`/`origin/main` verificados em `0c7834a`, merge técnico `e90fcee`.
- 12-C: ENCERRADA; Área Editorial validada, sem alteração de código.
- 13-A: PARCIAL; commit local declarado `4bf8dce`; Vitest 15/15, pgTAP 183/183 e Playwright 10/10; complementação no 13-B.

## Próxima ação da diretoria

Receber `RETORNO: 13-B`, verificar com ferramentas próprias e só então decidir a próxima sessão.

Auditoria nova preparada: 21-A2, para inventariar Biblioteca/Questões/Flashcards, medir conformidade e prontidão para packs. Pode rodar separadamente em modo somente leitura, desde que não concorra na documentação/arquivos do 13-B.
