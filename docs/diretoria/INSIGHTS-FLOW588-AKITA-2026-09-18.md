# Achados da análise do Flow #588 (Fabio Akita) — 2026-09-18

> Fonte: Flow Podcast #588, "Fabio Akita" (YouTube, publicado 2026-04-14),
> tema central "a IA vai roubar seu emprego?". A sessão diretoria não teve
> acesso direto ao vídeo/áudio (sem ferramenta de transcrição de YouTube
> disponível; a tentativa de baixar a legenda automática via API foi
> bloqueada — ver limitação abaixo). O usuário colou a legenda automática
> completa (~4h44min) em partes, ao longo de uma sessão diretoria. Este
> documento é a análise ponderada dessa transcrição, feita pela diretoria,
> cruzando cada achado com práticas já existentes no NexusMed antes de
> decidir se vale adotar, é redundante, ou não se aplica.

## Como usar este documento
Isto é análise, não é o novo estado do protocolo — as mudanças reais de
processo que resultaram desta análise já foram aplicadas diretamente em
[`MODELO-DIRETORIA.md`](MODELO-DIRETORIA.md) (seções "Papel", "Eficiência
de execução" e "Verificação cruzada"). Leia este arquivo só se quiser o
racional completo por trás dessas mudanças, ou se for decidir se um achado
listado como "não aplicado" deveria ser adotado depois de tudo.

## Critério de peso usado
A tese central do vídeo — "a IA reflete quem você é": acelera 5 a 10x quem
já tem disciplina de engenharia, acelera 10x a dívida técnica de quem não
tem — foi usada como critério para avaliar cada achado: vale adotar o que
aumenta disciplina real e verificável, descartar o que só parece
produtividade.

## Confirmado — já é prática do NexusMed, o vídeo só valida (nenhuma mudança de processo)

1. **Missões pequenas e verificadas em cadeia** (ex.: AS1-B1 → B1.1 → B2 →
   B3 → B3.1 → B3.2), nunca um lote grande sem checagem intermediária —
   bate com a analogia do vídeo "um pedaço de cada vez, testa, junta,
   próximo pedaço; nunca faz seis pedaços de uma vez".
2. **Gate completo antes de declarar pronto**, não só o teste da feature
   nova — bate com "antes de dizer que terminou, roda a suíte inteira de
   testes". Foi exatamente o que a verificação da AS1-B3.2 fez ao rerodar
   tsc/lint/vitest/pgTAP/e2e completos após o merge, não só o teste novo.
3. **Citação por afirmação, nunca por parágrafo, sem fonte circular**
   ([`feedback_padrao_nexusmed_rastreabilidade`], memória do usuário) — o
   detector de fake news que o Akita construiu (decompõe manchete em
   afirmações, busca fonte de cada uma, checa fonte circular) chegou
   independentemente ao mesmo formato de rigor, por um caminho totalmente
   diferente (jornalismo, não medicina).
4. **Responsabilidade do conteúdo é de quem publica, nunca da IA** — bate
   com a atestação humana já exigida antes de qualquer publicação no
   NexusMed. Frase do vídeo: "código gerado por IA é responsabilidade de
   quem usa, a responsabilidade não é da IA".
5. **Dado externo/não confiável é tratado com cautela antes de entrar num
   prompt** — mesmo princípio do "prompt injection é o SQL injection dos
   LLMs" (o modelo obedece instrução escrita dentro de um texto que devia
   ser só dado, a menos que seja instruído a não fazer isso).
6. **Rigor calibrado ao risco do domínio** (conteúdo médico, dado de
   estudante sob LGPD), não cargo-cult de prática de empresa grande nem
   descuido — bate com "não vou fazer meu softwarezinho de casa igual o
   Netflix faz".
7. **Diretoria decide entre opções técnicas em vez de devolver a decisão ao
   usuário quando é derivável** (já registrado como regra em memória do
   usuário, `feedback_sessao_diretoria_prompts_paralelos`) — é a mesma
   ideia que o vídeo descreve como "das 20 formas de resolver o mesmo
   problema, o sênior já sabe quais 2 ou 3 testar".
8. **Comparação de modelo é empírica, por tarefa, nunca dogmática** ("Claude
   é sempre melhor que Codex") — já é a premissa por trás da ideia de
   diretoria portátil entre Claude e Codex conforme capacidade/créditos
   disponíveis.

## Adotado nesta análise — mudanças reais aplicadas em MODELO-DIRETORIA.md

9. **Verificação cruzada entre modelos diferentes é mais forte que o mesmo
   modelo se reconferindo.** O vídeo dá um exemplo concreto: terminar algo
   no Claude Code e pedir para o Codex avaliar o histórico encontra 2-3
   coisas que o Claude não viu (e o inverso também já aconteceu com ele).
   **Como aplicou-se**: nova seção "Verificação cruzada" — para mudanças de
   risco alto (merge em `main`, decisão de taxonomia/conteúdo médico,
   qualquer escrita remota), preferir verificação por um modelo diferente
   do que executou, quando disponível.
10. **A diretoria tem autoridade para recusar um plano falho na raiz**, não
    só decidir escopo dentro de um plano ruim. Frase do vídeo: "eu já
    disse pra cliente, não vou fazer esse projeto, o que tá escrito aqui
    não faz sentido, você vai perder dinheiro, volte e refaça a lição de
    casa". **Como aplicou-se**: frase acrescentada à seção "Papel".

## Corrige algo sugerido antes, na mesma sessão de análise

11. **Formulário estruturado ("spec-driven development") não é o que
    garante um prompt melhor.** O próprio Akita descarta essa ideia
    explicitamente: "a LLM não foi treinada especificamente para esse
    formato, não faz diferença nenhuma; o que resolve é você saber
    explicar o problema". Antes de ler este trecho, a sessão diretoria
    tinha conjecturado que "spec-driven development" poderia refinar o
    formato de encaminhamento do `MODELO-DIRETORIA.md` — essa conjectura
    foi descartada. `MODELO-DIRETORIA.md` continua útil como checklist de
    completude (não deixar faltar objetivo/escopo/critério), mas o valor
    real de um bom encaminhamento vem de quem escreve entender e saber
    explicar o problema, não da rigidez do template. Nenhuma mudança de
    processo foi feita por causa deste item — é uma correção de raciocínio,
    registrada para não ser repetida.
12. **Nenhum encaminhamento é "manda e esquece", mesmo bem escrito.**
    Checagem periódica (ao menos diária/semanal) é necessária mesmo com um
    prompt excelente — analogia do vídeo: um arquiteto que nunca visita a
    obra sempre encontra surpresa no final. Isso já é como a diretoria
    opera de fato nesta sessão (nunca aceitando "terminei" sem verificação
    própria), mas não estava dito explicitamente como principio geral.

## Explicitamente descartado — não serve para o NexusMed

13. **"Todo software tem bug, só sei que funciona quando tem usuário
    usando"** (ethos de lançar rápido, corrigir depois) — calibrado para
    os projetos hobby pessoais do Akita (um bot, uma newsletter), onde o
    custo de um erro é baixo e reversível. Conteúdo médico para prova/
    prática clínica real tem um perfil de risco diferente. O nível de gate
    que o NexusMed já usa (pgTAP, e2e, atestação humana, rastreabilidade de
    citação) não é excesso de zelo comparado a este padrão — é a
    calibração correta para o domínio, e não deve ser relaxado por essa
    filosofia.
14. **`--yolo`/auto-aprovar toda ação sem confirmação** — o próprio Akita
    distingue "máquina pessoal de teste, tudo bem" de "máquina de trabalho
    ou de cliente, nunca". O NexusMed (produção real, dados de estudantes,
    conteúdo médico) está sempre na segunda categoria — o bloqueio do
    classificador de segurança do Claude Code para escritas remotas/deploy,
    que já apareceu nesta sessão, é o comportamento certo, não um
    obstáculo a contornar.

## Limitação técnica registrada durante esta análise

A sessão diretoria não conseguiu obter a legenda automática do YouTube
diretamente (a URL assinada retornada pela página `watch` respondeu vazia
mesmo com `Referer` correto — provável exigência de PoToken/sessão
autenticada que o `curl` simples não supre). Não foi tentado nenhum
contorno além dessa tentativa única. O usuário colou o texto manualmente.
Se uma sessão futura precisar de transcrição de YouTube novamente, esperar
o mesmo bloqueio e já partir para pedir ao usuário colar o texto, em vez de
repetir a mesma tentativa.
