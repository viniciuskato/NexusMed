# Roteiro — importar "Equilíbrio Ácido-Base" (AS1, tema 3) e smoke autenticado da Área Editorial

> Criado em 2026-09-18, véspera da prova AS1 (21/09). Resolve duas pendências
> abertas: a importação real do material auditado na cadeia AS1-B1→B3.2
> (`TASKS.md`, linha AS1-B3.2) e o smoke autenticado da Área Editorial em
> produção, pendente desde a 42-C. **Precisa de uma conta `admin` ativa em
> produção**: nenhuma sessão de IA tem essa credencial, então quem executa é o
> dono do projeto. Tempo estimado: 10 minutos.

## Ensaio já feito (Supabase local, 2026-09-18)

Rodei o fluxo real pela UI (Playwright/Chromium, build de produção) com o
arquivo versionado `docs/editorial/as1/acidobase.compendium.yaml` e a mesma
taxonomia de produção (disciplina "Nefrologia", tema "Distúrbio
Acidobásico"):

- A pré-visualização mostrou título "Equilíbrio Ácido-Base", Nefrologia /
  Distúrbio Acidobásico, **17 seções, 14 referências** e 5 tags. Não apareceu
  o quadro de campos ausentes nem sobreposição com o dock.
- "Salvar rascunho" → "criado com sucesso"; no banco, `status = draft` com 17
  seções.
- Os dados do ensaio foram apagados em seguida; o banco local ficou sem
  resíduo.

Em produção o tema já existe (`cbc160bc-9666-45a2-aa73-fbfccc8a7732`, criado
em 2026-09-18) e a disciplina também (`73fedd18-3600-40fc-bfc3-48bf4334d70a`).

## Passo a passo em produção

1. Abrir `https://synapse-med-firebase-auth.vercel.app` com a conta admin.
   Deixar o DevTools aberto na aba Console.
2. Menu do perfil → **Área Editorial / CMS**. Deve aparecer o botão
   "Publicar rascunhos". *(Smoke 1: a Área Editorial abre para admin.)*
3. **Importar material** → escolher o arquivo
   `docs/editorial/as1/acidobase.compendium.yaml` (baixar do GitHub, na branch
   `main`).
4. Conferir a pré-visualização. Tem que bater com o ensaio: 17 seções, 14
   referências, Nefrologia / Distúrbio Acidobásico, sem quadro de campos
   ausentes. Se aparecer "tema não encontrado", **parar** e avisar: o nome no
   catálogo divergiu. *(Smoke 2: parser e catálogo remoto.)*
5. **Salvar rascunho** → mensagem "criado com sucesso" → Fechar. O material
   aparece na lista como `rascunho`. *(Smoke 3: RPC
   `import_compendium_draft` em produção.)*
6. Abrir o rascunho e ler por cima pelo menos as seções de gasometria e de
   distúrbios mistos, que concentram as retificações da auditoria.
7. Publicar é uma decisão editorial separada. Se aprovado: **Publicar
   rascunhos** (ou publicar só este material). Depois, com uma conta de
   estudante, conferir que o material aparece na Biblioteca e no Estudo
   Temático.
8. Console sem erros vermelhos durante todo o fluxo. Se houver, copiar o
   texto do erro para o PR/issue.

## Conferência no banco (só leitura — SQL Editor do Supabase)

```sql
select m.title, m.status, m.updated_at,
       (select count(*) from public.material_sections s where s.material_id = m.id)   as secoes,
       (select count(*) from public.material_references r where r.material_id = m.id) as referencias
from public.materials m
where m.theme_id = 'cbc160bc-9666-45a2-aa73-fbfccc8a7732';
```

Esperado: 1 linha, `secoes = 17`, `referencias = 14`, `status` = `draft` ou
`published` (conforme o passo 7).

## Depois

Registrar em `docs/operacao/TASKS.md` (linha AS1-B3.2 e 42-C) a data, o
resultado dos smokes 1 a 3 e se o material foi publicado.
