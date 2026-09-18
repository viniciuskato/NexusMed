# BACKLOG-ESTRATEGICO.md — itens produzidos pela sessão de auditoria

Criado em 2026-09-18, junto com a separação do papel "sessão de
auditoria" descrita em
[`MODELO-DIRETORIA.md`](MODELO-DIRETORIA.md#sessão-de-auditoria-papel-estratégico-adicionado-2026-09-18).

Este arquivo é a **única saída** de uma sessão de auditoria e a
**única ponte** entre ela e a diretoria — não existe sessão viva de
auditoria esperando resposta. A diretoria lê este arquivo ao abrir uma
sessão nova (junto com `TASKS.md` e `docs/diretoria/registro.md`) e
decide, por conta própria, se/quando puxar um item.

## Formato de item

Cada item precisa ser entendível por uma sessão de diretoria **sem**
contexto da auditoria que o escreveu. Use este esqueleto:

```
### <ID> — <título curto>
- **Registrado em**: <data> pela sessão de auditoria
- **Problema**: o que foi observado, em termos concretos (não "poderia
  ser melhor" — o quê, exatamente, e onde).
- **Por que importa**: consequência real de não resolver, ou ganho real
  de resolver. Sem isso o item não é priorizável.
- **Prioridade relativa**: como se compara a outros itens abertos aqui
  e às entregas já em `TASKS.md` (bloqueia algo? é independente?).
- **Contexto mínimo pra puxar**: arquivos/decisões/estado que uma
  diretoria precisa ler antes de transformar isto num encaminhamento —
  não repetir a auditoria inteira, só o necessário.
- **Estado**: Aberto | Em andamento (entrega NN-X) | Descartado (motivo)
  | Concluído (entrega NN-X)
```

Itens descartados ou concluídos **não são apagados** — mudam de estado
e ficam como histórico (mesma lógica de preservação já usada em
`docs/diretoria/registro.md` e `DECISIONS.md`).

## Itens

_Nenhum item registrado ainda — o primeiro item será adicionado na
próxima sessão de auditoria explicitamente convocada pelo usuário._
