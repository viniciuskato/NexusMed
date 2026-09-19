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
- Leia `PROJECT_STATE.md`, `TASKS.md` e `AGENTS.md` (raiz) para o estado
  atual antes de tocar código, mesmo que o encaminhamento pareça
  autocontido — reconfirme drift real com `git fetch`/`git status`, nunca
  assuma a partir do texto do prompt.
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
RETORNO: <identificador do encaminhamento>
- Resultado
- Alterações (arquivos, dados, comportamento visível)
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
