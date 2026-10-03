import { psqlLocal } from './localSupabase';

// 44-H2 — fixture de teste: "esta questão passou pelo revisor de IA". Publicar uma questão
// nova exige revisão de IA "apto" vinculada ao conteúdo atual (o banco recusa a
// atestação humana sozinha). Os testes que só querem uma questão publicável ganham a
// revisão como o servidor a deixaria: um envio de questões já publicado, a revisão
// "apto" do texto e a proveniência da questão como ela está agora. Só no banco local.
//
// 44-H3: devolve a função que LIMPA o que criou (o envio, a revisão que cai junto com ele e a
// proveniência). Quem chama a coloca NA FRENTE da lista de limpeza (`cleanup.unshift`): o
// `runCleanup` executa na ordem dada, não LIFO (AGENTS.md, risco 18), e o envio tem o usuário
// autor como dono.
export function aprovarQuestaoPorIA(questionId: string): () => void {
  if (!/^[0-9a-f-]{36}$/i.test(questionId)) throw new Error(`id de questão inválido: ${questionId}`);
  const titulo = `Envio de fixture E2E ${questionId}`;
  psqlLocal(
    `with u as (select id from public.profiles where role = 'admin' and status = 'active' limit 1), ` +
      `s as (insert into public.question_submissions (author_id, title, content_md, status, published_question_ids) ` +
      `select id, '${titulo}', '## Questão 1', 'publicado', array['${questionId}'::uuid] from u ` +
      `returning id, content_sha256), ` +
      `r as (insert into public.material_reviews (question_submission_id, content_sha256, status, verdict, model, completed_at) ` +
      `select id, content_sha256, 'concluida', 'apto', 'fixture-e2e', now() from s returning id, question_submission_id) ` +
      `insert into public.question_ai_provenance (question_id, submission_id, review_id, review_verdict, reviewed_at, model, text_sha256, snapshot_hash) ` +
      `select '${questionId}'::uuid, s.id, r.id, 'apto', now(), 'fixture-e2e', s.content_sha256, app.question_snapshot_hash('${questionId}'::uuid) ` +
      `from s join r on r.question_submission_id = s.id ` +
      `on conflict (question_id) do update set submission_id = excluded.submission_id, review_id = excluded.review_id, ` +
      `snapshot_hash = excluded.snapshot_hash, text_sha256 = excluded.text_sha256;`,
  );
  return () => {
    psqlLocal(`delete from public.question_ai_provenance where question_id = '${questionId}';`);
    // A revisão cai junto com o envio (on delete cascade).
    psqlLocal(`delete from public.question_submissions where title = '${titulo}';`);
  };
}

/** Quantos resíduos desta fixture ainda existem (para o teste conferir que limpou). */
export function residuosDaProveniencia(): number {
  return Number(
    psqlLocal(
      `select (select count(*) from public.question_submissions where title like 'Envio de fixture E2E %') + ` +
        `(select count(*) from public.material_reviews where model = 'fixture-e2e') + ` +
        `(select count(*) from public.question_ai_provenance where model = 'fixture-e2e');`,
    ),
  );
}
