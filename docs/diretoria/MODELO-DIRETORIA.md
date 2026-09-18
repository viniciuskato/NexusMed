# Modelo de operação da diretoria

Convenção aprovada pelo usuário em 2026-09-07. Este modelo substitui formatos anteriores de acompanhamento que conflitem com ele.

## Três papéis, não dois (atualização 2026-09-18)

Desde 2026-09-18 existem três papéis de sessão, não dois. O que este
documento chama de "diretoria" abaixo permanece **exatamente como
sempre foi** — planeja, formula encaminhamentos, verifica retorno — não
foi renomeado. O que mudou é que um papel novo, mais raro, foi separado
dela: a **sessão de auditoria** (ver seção própria mais abaixo), que
pensa o projeto inteiro e a evolução de longo prazo, sem gerar
encaminhamento nenhum. Resumo dos três:

1. **Sessão de auditoria** — esporádica, só sob pedido explícito do
   usuário (equivalente ao `raio-x-cowork`/`autocritica-cowork` do
   ambiente Cowork, aplicado a este projeto). Lê o projeto inteiro,
   audita, propõe evolução criativa. Não escreve encaminhamento — só
   registra itens em
   [`docs/diretoria/BACKLOG-ESTRATEGICO.md`](BACKLOG-ESTRATEGICO.md).
2. **Sessão diretoria** — o papel já descrito no resto deste documento,
   sem mudança. Escopo fechado (uma entrega/fase), pega itens do
   backlog estratégico ou pendências já conhecidas, formula
   encaminhamentos, verifica retorno.
3. **Sessão executiva** — sem mudança, ver `EXECUTOR_PROTOCOL.md`.

A ponte entre auditoria e diretoria é sempre o arquivo de backlog, nunca
uma sessão viva esperando resposta síncrona da outra — isso evita
inflar o laço barato e frequente diretoria→executiva com mais uma troca
de sessão obrigatória a cada entrega.

## Papel
A diretoria é criativa e interativa: discute, questiona, decide, prepara instruções autocontidas e avalia resultados. As executivas implementam e verificam. A diretoria registra decisões e convenções; não assume a execução por receber um retorno ou uma cópia de prompt. A diretoria também tem autoridade para recusar um plano falho na raiz — não se limita a decidir escopo dentro de um plano ruim; se o pedido não faz sentido técnico, o correto é dizer isso e propor refazer, não executar mesmo assim.

## Organização por entrega
A unidade de acompanhamento é a entrega, com número estável (01, 02 etc.). Cada encaminhamento recebe uma letra: 01-A inicial, 01-B complemento. Revisões do mesmo encaminhamento indicam versão e qual texto substituem. Preserve os identificadores antigos como aliases; não invalide prompts já enviados. Não renumere o histórico.

Mantenha três perspectivas: fila priorizada do que pode executar agora; acompanhamento do que está em execução, voltou ou exige decisão; histórico de instruções, retornos e aprovações.

## Encaminhamentos
Um bloco de código independente por prompt, número e título dentro do bloco. Inclua objetivo, contexto necessário, escopo, restrições, critérios de conclusão, dependências e formato de retorno. Discussão fica fora dos blocos. Não exija que o usuário monte contexto copiando vários trechos.

Evite emitir prompts completos muito antes da liberação: registre a entrega planejada e finalize a instrução quando houver informações suficientes. Não invente tarefas para encerrar uma conversa exploratória.

A executiva encerra com um bloco copiável: RETORNO: 01-B; Resultado; Alterações; Validações; Pendências; Estado de publicação. Aceite retornos legados e linguagem natural.

## Estados e evidência
Planejado; Preparado (envio não confirmado); Em execução (usuário confirmou envio); Retorno recebido/em análise; Concluído (critérios atendidos). Publicação é informação separada: implementação local não significa entrega publicada.

Aceite “ENVIEI: 06-B” ou “mandei para rodar”. Só marque Em execução após confirmação do usuário. Arquivos locais podem indicar atividade, mas não comprovam o envio de um encaminhamento. Preserve essa evidência como observação sem promover o status. Um retorno parcial não encerra automaticamente a entrega.

## Liberação e concorrência
Avalie separadamente: há informações suficientes para enviar? Pode executar junto das sessões ativas? Confira dependências e sobreposição de arquivos, dados, migrações e decisões. Sem evidência de isolamento, não libere implementações conflitantes na mesma árvore. Diagnósticos somente leitura podem avançar em paralelo quando independentes. Não presuma que branches na mesma pasta isolam executivas.

A tabela final deve conter: Entrega | Etapa/ID atual | Estado | Próxima ação / dependência. Diga explicitamente “Pode enviar”, “Aguarda retorno de NN — motivo”, “Definir isolamento antes de enviar” ou “Já enviado; aguardar retorno”. Indique prioridade quando útil. Mostre apenas o histórico necessário na conversa.

## Persistência
Use docs/diretoria/registro.md como painel atual, fila e decisões. Guarde instruções emitidas em docs/diretoria/prompts/ e retornos em docs/diretoria/retornos/, identificados por etapa/versão. Não fabrique transcrições completas a partir de resumos; rotule resumos. Atualize o acompanhamento quando houver envio confirmado, retorno ou decisão, preservando trabalho concorrente e fatos anteriores.

Ao retomar uma sessão, leia AGENTS.md, este modelo e registro.md. Reconcilie divergências com a última confirmação do usuário e mantenha incertezas explícitas.

## Independência de sessão
Todo prompt, inclusive complemento, deve poder ser executado por uma sessão nova sem acesso à conversa anterior. Inclua o caminho do projeto, leituras necessárias, decisões, estado conhecido e verificações pendentes. Oriente a inspecionar e aproveitar alterações existentes, sem exigir continuidade na mesma sessão. Confirme ausência de escritores concorrentes nos mesmos arquivos antes da edição. Esta regra substitui recomendações anteriores de encaminhamento obrigatório à mesma executiva.

## Eficiência de execução
Por padrão, diretoria e executiva resolvem cada passo com ferramentas diretas (ler arquivo, rodar comando, editar) — não delegam a subagentes a menos que a tarefa exija pesquisa genuinamente paralela ou isolamento de contexto que a própria sessão não consegue fazer sozinha. Um passo único e prescrito (rodar um teste, conferir um diff, aplicar uma correção) nunca justifica abrir um subagente. Ao formular um encaminhamento para a executiva, inclua essa restrição quando o escopo for fechado.

## Verificação cruzada
Para mudanças de risco alto (merge em `main`, decisão de taxonomia/conteúdo médico, qualquer escrita remota), prefira que a verificação seja feita por um modelo diferente do que executou, quando disponível — o mesmo modelo reconferindo o próprio trabalho tende a repetir os mesmos pontos cegos. Verificação pelo mesmo modelo que executou ainda vale mais que nenhuma verificação, mas não é equivalente a uma checagem cruzada real.

## Sessão de auditoria (papel estratégico, adicionado 2026-09-18)

**Quando abrir**: só sob pedido explícito do usuário — "faz um raio-x do projeto", pedido de evolução criativa, fechamento de um marco grande. Nunca automaticamente ao fechar uma entrega ou fase; isso continua sendo fechamento normal de diretoria.

**Escopo**: o projeto inteiro, não uma entrega. Ler `AGENTS.md`, `docs/operacao/PROJECT_STATE.md`, `DECISIONS.md`, `TASKS.md`, `docs/diretoria/registro.md` e o que mais for necessário para avaliar direção, não só estado pontual.

**Saída — e só esta**: itens novos ou atualizados em [`docs/diretoria/BACKLOG-ESTRATEGICO.md`](BACKLOG-ESTRATEGICO.md). A sessão de auditoria **não escreve encaminhamento** (isso é trabalho da diretoria) e **não implementa nada**. Cada item precisa ser autocontido o bastante para uma sessão de diretoria futura, sem contexto da auditoria, entender do que se trata e decidir se/quando puxar — ver formato exigido no próprio arquivo de backlog.

**Depois de registrar os itens**, a sessão de auditoria encerra. Não fica aguardando uma diretoria pegar o item nem cobra retorno — a diretoria consulta o backlog estratégico por conta própria ao abrir uma sessão nova, do mesmo jeito que já consulta `TASKS.md` e `docs/diretoria/registro.md`.

**A diretoria também pode escrever no backlog estratégico**, no sentido contrário: se, no meio de uma entrega, perceber algo maior que o escopo daquela entrega ("isso é reformulação, não ajuste"), registra um item novo lá em vez de tentar resolver dentro do encaminhamento atual ou convocar uma sessão de auditoria ao vivo.
