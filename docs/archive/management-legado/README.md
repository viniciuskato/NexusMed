# NexusMed — memória Git da diretoria (ARQUIVADO)

> **Arquivado em 2026-09-21.** Este era um sistema de acompanhamento de
> diretoria paralelo, parado desde 2026-09-12. O fluxo atual de estado,
> decisões e fila de trabalho vive em
> [`docs/operacao/`](../../operacao/) e
> [`docs/diretoria/`](../../diretoria/) — ver
> [`AGENTS.md`](../../../AGENTS.md). O texto abaixo é histórico e cita um
> caminho de repositório (`...\NexusMed\firebase-auth`) que não existe
> mais na estrutura atual; preservado sem edição por ser registro do que
> foi, não do que é.

Este repositório é o plano de controle do projeto. O código continua em `C:\Users\vinic\dev\NexusMed\firebase-auth`; aqui ficam decisões, despachos, retornos e verificações entre sessões.

## Regra central

Cada sessão executiva possui um identificador estável e um arquivo em `sessions/`. O arquivo registra o ciclo completo:

`PLANEJADA → DESPACHADA → EM_EXECUCAO → RETORNO_RECEBIDO → VERIFICADA → ACEITA | PARCIAL | BLOQUEADA → PUBLICADA | ENCERRADA`

`STATUS.md` é o painel atual. O histórico real é o Git; nunca reescreva decisões antigas para parecer que já eram conhecidas.

## Fluxo mínimo

1. A diretoria cria/atualiza `sessions/<ID>.md` e `STATUS.md`.
2. Commit de despacho: `dispatch(<ID>): libera <título>`.
3. A executiva trabalha no repositório de código em branch própria e retorna branch, commit, testes e publicação.
4. A diretoria registra o retorno sem validá-lo automaticamente: `return(<ID>): registra retorno declarado`.
5. Após checagem independente: `decision(<ID>): aceita|complementa|bloqueia`.
6. Quando publicado: `publish(<ID>): registra hashes e smoke`.

Um retorno nunca substitui a verificação independente. Um prompt futuro só é liberado depois do commit de decisão correspondente.

## Relação resultado/tokens

- Registrar fatos novos; referenciar evidências já versionadas em vez de copiá-las.
- Um único arquivo por sessão, salvo artefatos realmente necessários.
- Não guardar logs extensos, bundles, dependências, tokens, `.env`, dados pessoais ou dumps.
- Separar nova sessão apenas quando houver mudança de autoridade, risco ou decisão.
- O registro deve permitir que uma diretoria nova retome o projeto lendo `README.md`, `STATUS.md` e o arquivo da sessão ativa.

## Convenção Git

- Branch permanente: `main`.
- Este repositório registra a diretoria; branches executivas do código são apenas referenciadas.
- Commits pequenos por evento: `dispatch`, `return`, `verify`, `decision`, `publish`, `docs`.
- Tags opcionais para marcos publicados: `nexusmed/<ID>/published`.
- Sem force push e sem reescrever commits de decisão.

## Segurança

Nunca versionar credenciais, URLs com tokens, conteúdo médico pessoal, e-mails de fixtures ou artefatos brutos do navegador. Registre contagens, hashes, caminhos e conclusões sanitizadas.

