# SESSION_PROTOCOL.md — contrato de abertura e fechamento de sessão

> Vale para qualquer sessão de IA que trabalhe neste repositório —
> auditoria, diretoria ou execução (trilha), Claude, Codex ou outra
> ferramenta. Papéis em
> [`../diretoria/MODELO-DIRETORIA.md`](../diretoria/MODELO-DIRETORIA.md):
> a sessão de auditoria é esporádica e só sob pedido explícito do
> usuário; desde 2026-09-23 a execução é feita por trilhas.

## Abertura obrigatória

1. Ler conforme o papel — a leitura é curta de propósito: documento lido
   sem necessidade custa tokens em toda sessão e dilui o que importa.
   - **Trilha (execução):** `AGENTS.md` (raiz) e
     [`EXECUTOR_PROTOCOL.md`](EXECUTOR_PROTOCOL.md); depois, a cada
     unidade, a própria unidade no plano e os achados que ela cita. O resto
     só quando a unidade apontar ou faltar um fato. [`RUNBOOK.md`](RUNBOOK.md)
     quando for testar ou publicar.
   - **Diretoria:** `AGENTS.md` → o plano canônico
     (`docs/produto/PLANO-DE-DESENVOLVIMENTO.md`) →
     [`DECISIONS.md`](DECISIONS.md) (entradas recentes) →
     [`PROJECT_STATE.md`](PROJECT_STATE.md) quando o assunto tocar
     ambientes → [`../diretoria/BACKLOG-ESTRATEGICO.md`](../diretoria/BACKLOG-ESTRATEGICO.md)
     quando for mexer em unidade que resolve achado.
   - **Auditoria:** o projeto inteiro, conforme `MODELO-DIRETORIA.md` —
     esta lista vale como piso mínimo.
2. Reconfirmar estado real, nunca assumir a partir de memória de
   conversa anterior:
   ```
   git fetch origin
   git status --short --branch
   git rev-parse origin/main
   ```
3. Se houver divergência entre o que os documentos lidos descrevem e o que
   os comandos acima mostram — **parar e relatar a divergência antes de
   agir**, não presumir qual dos dois está certo.
4. Definir (ou confirmar, se veio de uma unidade do plano canônico,
   `docs/produto/PLANO-DE-DESENVOLVIMENTO.md`) **um único objetivo
   principal** para a sessão. Duas sessões não devem escrever nos mesmos
   arquivos ao mesmo tempo — checar o estado das unidades no plano e
   `TASKS.md`, e perguntar se houver qualquer dúvida de sobreposição.
5. Chats e memória do usuário nunca substituem os passos 1-3 — são, no
   máximo, um resumo a ser verificado, não uma fonte.

## Fechamento obrigatório

Toda sessão encerra devolvendo um relatório em linguagem executiva —
alguém sem contexto técnico profundo precisa conseguir decidir "posso
confiar nisso, e o que fazer a seguir" só lendo o relatório. Checklist
mínimo, todos os itens. **Na trilha, o relatório é o bloco RETORNO na
descrição do PR** (`EXECUTOR_PROTOCOL.md`), que já cobre estes itens; fora do
PR, basta dizer em que unidade a trilha está e o que espera.

- [ ] **Objetivo**: o que a sessão tentou fazer (uma frase).
- [ ] **Impacto**: o que de fato mudou — arquivos, dados, comportamento
      visível. "Nada mudou" é uma resposta válida e deve ser dita
      explicitamente quando for o caso.
- [ ] **Ambiente**: local, Supabase local, Supabase remoto, ou produção —
      qual(is) foram tocados.
- [ ] **Risco**: o que pode dar errado por causa desta mudança, e para
      quem (nenhum usuário afetado / usuários de teste apenas / usuários
      reais).
- [ ] **Reversibilidade**: como desfazer, se precisar (ver
      [`RUNBOOK.md`](RUNBOOK.md), seção Rollback) — ou "não reversível,
      motivo X" quando for o caso.
- [ ] **Evidência**: comandos/testes rodados e o resultado real (não "deu
      certo" sem mostrar o quê) — hashes, contagens antes/depois, saída
      de teste.
- [ ] **Publicação**: branch local apenas / branch candidata enviada ao
      remoto / mesclada em `main` / publicada em produção e confirmada por
      smoke test. Nunca deixar implícito.
- [ ] **Próxima decisão**: o que precisa que a diretoria/usuário decida
      agora, se houver algo pendente — ou "nenhuma, entrega fechada".
- [ ] **Aprendizado operacional**: declarar se houve falha nova com causa
      generalizável; se houve, vincular incidente, regra e prevenção
      executável.

Depois de reportar, **atualizar os documentos**, não só a conversa. A
trilha atualiza só o que `EXECUTOR_PROTOCOL.md` manda (a linha "Estado" da
unidade, achados, backlog) e, se for o caso, `AGENTS.md` e `incidents/`; o
resto é da diretoria:

- `TASKS.md`: estado real da(s) tarefa(s) tocada(s).
- `DECISIONS.md`: se alguma decisão durável nova foi tomada (não tarefas,
  não estado — decisões que valem para sessões futuras).
- `PROJECT_STATE.md`: se o estado presente verificável mudou (nova
  baseline, novo risco descoberto, risco anterior resolvido).
- `AGENTS.md` (raiz): se foi descoberta uma armadilha técnica nova de alta
  probabilidade de recorrência, ou uma convenção de trabalho mudou.
- `incidents/`: se a sessão encontrou falha relevante conforme os critérios
  de [`incidents/index.md`](incidents/index.md); promover a regra para
  `standards/`, runbook, decisão e teste/CI sem duplicar a narrativa.

## Regras de segurança sempre válidas, sem exceção implícita

- Não fazer force push, `reset --hard` compartilhado, ou merge em `main`
  sem autorização explícita **para aquela mudança específica**.
- Não presumir que uma autorização anterior cobre uma ação nova.
- Não tratar trabalho local ou uma branch candidata como equivalente a
  "publicado".
- Não inventar estado técnico — o que não pôde ser verificado é "não
  verificado", nunca uma suposição apresentada como fato.
- Não expor valores de `.env`/credenciais em nenhum relatório, commit ou
  documento.
