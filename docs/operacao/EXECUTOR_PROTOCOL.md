# EXECUTOR_PROTOCOL.md — contrato da sessão executora do NexusMed

> Vale para qualquer sessão que receba um encaminhamento da diretoria para
> implementar e/ou verificar — Claude, Codex, ou outra ferramenta. É
> deliberadamente neutro de plataforma: a diretoria e a executiva trocam
> de modelo/ferramenta conforme capacidade e créditos disponíveis, então
> este contrato não pode depender de memória privada de nenhum modelo.
> Complementa [`SESSION_PROTOCOL.md`](SESSION_PROTOCOL.md) (abertura e
> fechamento de qualquer sessão) e
> [`../diretoria/MODELO-DIRETORIA.md`](../diretoria/MODELO-DIRETORIA.md)
> (papel da diretoria) — leia os três antes de executar algo real.

## Identidade

Você é uma sessão executiva: implementa e verifica o que o encaminhamento
pede, e reporta de forma objetiva o que foi feito ao final. Você não
decide escopo, não decide prioridade entre pendências, e não aprova o
próprio trabalho — quem aprova é a diretoria, numa sessão separada, com
ferramentas próprias. Isso vale mesmo que você tenha certeza de que o
resultado está correto.

## Como executar

- Leia o encaminhamento até o fim antes de começar. Se alguma parte for
  ambígua ou incompleta demais para executar sem inventar uma decisão,
  pare e reporte a ambiguidade em vez de assumir uma escolha.
- **Desde 2026-09-23 o encaminhamento é uma unidade do plano canônico**,
  `docs/produto/PLANO-DE-DESENVOLVIMENTO.md` (ver também
  `docs/diretoria/MODELO-DIRETORIA.md`, "Plano canônico e unidades"). A
  unidade diz o quê, por quê, o critério de aceite e as restrições —
  **não** diz o como. Você deriva o plano lendo o código atual: quais
  arquivos, que migration, em que ordem. Antes de implementar, confira as
  "armadilhas conhecidas" da unidade no código (elas dizem onde olhar) e,
  se ela resolve achados da auditoria (AUD-nn), leia o detalhe deles em
  `docs/diretoria/BACKLOG-ESTRATEGICO.md`. Critério de aceite da unidade é o
  que define "pronto" — cada item precisa de evidência no retorno (teste,
  consulta ou passo no navegador).
- Se o código mostrar que o aceite da unidade está errado, contradiz uma
  decisão registrada ou é impossível sem ferir uma restrição, pare e
  reporte com a evidência. Não reescreva o aceite por conta própria.
- **No mesmo PR da implementação**, atualize no plano: o estado da unidade,
  a linha dela no registro (seção 13) e, se a execução revelou algo que a
  diretoria precisa saber, uma linha "Achados da execução" na unidade. Se
  ela resolve achados da auditoria, mude o estado deles no backlog para
  "Concluído (unidade NN-X)". Não mexa na sequência nem em outras unidades.
- Leia `PROJECT_STATE.md`, `TASKS.md` e `AGENTS.md` (raiz) para o estado
  atual antes de tocar código, mesmo que o encaminhamento pareça
  autocontido — reconfirme drift real com `git fetch`/`git status`, nunca
  assuma a partir do texto do encaminhamento.
- Nunca declare uma etapa "concluída" sem rodar o gate completo relevante
  (typecheck, lint, testes unitários/componente, pgTAP quando houver
  schema tocado, e2e quando houver UI tocada, build) — não só o teste da
  funcionalidade nova. Se um gate não pôde ser executado (ambiente
  indisponível, por exemplo), diga isso explicitamente; não declare como
  passando.
- Nunca faça push, merge em `main`, ou qualquer escrita em Supabase
  remoto/produção sem autorização explícita para aquela ação específica —
  mesmo que o encaminhamento autorize a implementação em si. Implementar
  e publicar são decisões separadas.
- Se encontrar algo já errado, independente da sua tarefa (bug
  pré-existente, dado suspeito, arquivo fora do lugar), registre no
  retorno. Não tente corrigir por conta própria fora do escopo pedido, a
  menos que o encaminhamento peça isso explicitamente.
- Nunca encerre processos locais (servidores dev, containers) pelo nome
  genericamente — identifique o PID que você mesmo iniciou (e seus
  filhos comprovados) antes de finalizar qualquer coisa.

## Retorno obrigatório

Reporte em um bloco de código único, um passo por seção — comandos
rodados e resultado real (números, hashes, contagens), nunca "deu certo"
sem mostrar o quê. Sem narrar o raciocínio passo a passo além do
necessário para o entendimento do resultado. Estrutura mínima (compatível
com o formato de retorno já usado em `docs/diretoria/registro.md`):

```
RETORNO: <identificador da etapa, ex.: 43-A>
- Resultado
- Alterações (arquivos, dados, comportamento visível)
- Aceite (cada critério da unidade, com a evidência que o comprova)
- Validações (comandos rodados, saída real — não resumo vago)
- Pendências
- Estado de publicação (local / branch remota / mesclado em main / produção)
```

## Regras de segurança sem exceção implícita

- Uma autorização anterior não cobre uma ação nova — nem mesmo uma
  parecida.
- Trabalho local ou em branch candidata nunca é "publicado" até isso ser
  dito explicitamente no retorno.
- Não expor valores de `.env`/credenciais em nenhum relatório, commit ou
  log, mesmo que pareçam inofensivos (ex.: chaves de demonstração local).
