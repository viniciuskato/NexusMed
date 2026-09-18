# PRODUTO.md — para quem é, como medir, o que falta para crescer

Criado na auditoria de 2026-09-18. Não é especificação técnica: são as
decisões de produto que o código não consegue tomar sozinho, as métricas
para saber se o NexusMed está ajudando quem usa, e o que precisa estar
resolvido antes de abrir para além do grupo de amigos.

## 1. Decisões em aberto (cabem ao dono do produto)

Cada resposta muda o que vale a pena construir. Registrar a decisão em
`docs/operacao/DECISIONS.md` quando tomada.

1. **Para quem é, nos próximos 3 meses?**
   (a) a turma/grupo atual, para as provas da faculdade (AS1 etc.);
   (b) residência médica em geral (o que o README diz);
   (c) as duas. O acervo e a taxonomia hoje seguem o currículo da
   faculdade (AS1); o discurso é de residência. Concorrer em residência
   significa enfrentar Medway, Estratégia MED, Sanar e MedCof, que têm
   dezenas de milhares de questões — o diferencial possível do NexusMed é
   outro: **conteúdo curado, com fonte rastreável, alinhado ao currículo
   de uma turma**.
2. **Conteúdo ou funcionalidade?** Dos 21 temas da AS1 (prova em
   21/09/2026), nenhum tem cobertura completa e auditada
   (`docs/diretoria/AS1-INVENTARIO-2026-09-17.md`), enquanto Pomodoro,
   radar de banca e perfil cognitivo já existem. Recomendação da
   auditoria: até a próxima prova, esforço em conteúdo; funcionalidade
   nova só se destravar produção de conteúdo (importação, revisão).
3. **Vai cobrar?** Hoje não há modelo de receita (o "plano premium" é só
   um valor no navegador). Cobrar muda o nível de exigência em tudo o que
   está na seção 3.
4. **Leitura offline é requisito?** Se sim, a leitura precisa ser
   reescrita (AUD-05 no backlog estratégico); se não, simplificar.

## 2. Métricas (rodar no SQL Editor do Supabase — só leitura)

Três números bastam para começar. Olhar semanalmente.

**Estudantes ativos por semana** (respondeu questão ou revisou card):

```sql
select date_trunc('week', t.at)::date as semana, count(distinct t.user_id) as ativos
from (
  select user_id, answered_at as at from public.question_attempts
  union all
  select f.user_id, r.reviewed_at from public.flashcard_reviews r
  join public.flashcards f on f.id = r.flashcard_id
) t
group by 1 order by 1 desc limit 8;
```

**Volume de estudo por estudante na semana** (questões, acerto, cards):

```sql
select p.display_name,
       count(qa.id) filter (where qa.answered_at > now() - interval '7 days') as questoes_7d,
       round(100.0 * avg(qa.is_correct::int) filter (where qa.answered_at > now() - interval '7 days'), 0) as acerto_pct_7d,
       (select count(*) from public.flashcard_reviews r join public.flashcards f on f.id = r.flashcard_id
         where f.user_id = p.id and r.reviewed_at > now() - interval '7 days') as cards_7d
from public.profiles p
left join public.question_attempts qa on qa.user_id = p.id
where p.status = 'active'
group by p.id, p.display_name
order by questoes_7d desc;
```

**Acervo publicado** (o que o estudante efetivamente tem para estudar):

```sql
select
  (select count(*) from public.materials where status = 'published') as materiais_publicados,
  (select count(*) from public.materials where status = 'draft')     as materiais_rascunho,
  (select count(*) from public.questions where status = 'published') as questoes_publicadas,
  (select count(*) from public.questions where status = 'draft')     as questoes_rascunho;
```

Sinal de alerta: estudantes ativos caindo semana a semana, ou acervo
publicado parado enquanto o código cresce.

## 3. Antes de abrir para além do grupo de amigos

- [ ] **Direitos autorais do conteúdo.** Materiais convertidos de PDFs de
      aula, apostilas ou livros precisam de autorização de quem detém os
      direitos, ou de conteúdo próprio (reescrito, com citação). Hoje a
      proveniência registra a fonte, mas não a permissão de uso.
- [ ] **Aviso de responsabilidade médica.** Conteúdo educacional, não
      substitui diretriz/prescrição; quem revisou e quando (a atestação
      editorial já guarda isso — falta exibir ao estudante).
- [ ] **LGPD.** A página `public/privacidade.html` existe, mas não informa
      como pedir exclusão da conta e dos dados nem os demais direitos do
      titular; não existe fluxo de exclusão de conta no app. Definir o
      controlador (quem responde pelos dados) e o prazo de retenção.
- [ ] **Autoria fictícia removida** (PR #3) e nenhum conteúdo de
      demonstração alcançável em produção.
- [ ] **Conta funcionando de ponta a ponta**: recuperação de senha
      (AUD-01) e configuração de cadastro/confirmação de e-mail (AUD-03).
- [ ] **Processo**: CI verde obrigatório e proteção do `main` (PR #8,
      AUD-02), porque cada push é produção.
