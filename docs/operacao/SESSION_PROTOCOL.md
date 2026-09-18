# SESSION_PROTOCOL.md — contrato de abertura e fechamento de sessão

> Vale para qualquer sessão de IA que trabalhe neste repositório —
> auditoria, diretoria ou executiva, Claude, Codex ou outra ferramenta.
> Três papéis desde 2026-09-18, ver
> [`../diretoria/MODELO-DIRETORIA.md`](../diretoria/MODELO-DIRETORIA.md):
> a sessão de auditoria é esporádica e só sob pedido explícito do
> usuário; diretoria e executiva seguem exatamente como antes.

## Abertura obrigatória

1. Ler, nesta ordem: [`PROJECT_STATE.md`](PROJECT_STATE.md) →
   [`DECISIONS.md`](DECISIONS.md) → [`TASKS.md`](TASKS.md) → `AGENTS.md`
   (raiz do repositório). Se a sessão for de diretoria, ler também
   [`../diretoria/BACKLOG-ESTRATEGICO.md`](../diretoria/BACKLOG-ESTRATEGICO.md)
   para ver se há item estratégico pendente relevante à entrega. Ler
   [`RUNBOOK.md`](RUNBOOK.md) quando a sessão for executar algo (build,
   teste, publicação), não só planejar. Se a sessão for a executiva de
   um encaminhamento (não a diretoria), ler também
   [`EXECUTOR_PROTOCOL.md`](EXECUTOR_PROTOCOL.md) antes de começar. Se a
   sessão for de auditoria, ler o projeto inteiro conforme escopo
   descrito em `MODELO-DIRETORIA.md` — este checklist de abertura ainda
   vale como piso mínimo.
2. Reconfirmar estado real, nunca assumir a partir de memória de
   conversa anterior:
   ```
   git fetch origin
   git status --short --branch
   git rev-parse origin/main
   ```
3. Se houver divergência entre o que `PROJECT_STATE.md` descreve e o que
   os comandos acima mostram — **parar e relatar a divergência antes de
   agir**, não presumir qual dos dois está certo.
4. Definir (ou confirmar, se veio de um prompt de diretoria) **um único
   objetivo principal** para a sessão. Duas sessões não devem escrever nos
   mesmos arquivos ao mesmo tempo — checar `TASKS.md` e perguntar se
   houver qualquer dúvida de sobreposição.
5. Chats e memória do usuário nunca substituem os passos 1-3 — são, no
   máximo, um resumo a ser verificado, não uma fonte.

## Fechamento obrigatório

Toda sessão encerra devolvendo um relatório em linguagem executiva —
alguém sem contexto técnico profundo precisa conseguir decidir "posso
confiar nisso, e o que fazer a seguir" só lendo o relatório. Checklist
mínimo, todos os itens:

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

Depois de reportar, **atualizar os documentos**, não só a conversa:

- `TASKS.md`: estado real da(s) tarefa(s) tocada(s).
- `DECISIONS.md`: se alguma decisão durável nova foi tomada (não tarefas,
  não estado — decisões que valem para sessões futuras).
- `PROJECT_STATE.md`: se o estado presente verificável mudou (nova
  baseline, novo risco descoberto, risco anterior resolvido).
- `AGENTS.md` (raiz): se foi descoberta uma armadilha técnica nova de alta
  probabilidade de recorrência, ou uma convenção de trabalho mudou.

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
