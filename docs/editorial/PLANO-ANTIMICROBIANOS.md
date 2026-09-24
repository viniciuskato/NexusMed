# Plano de produção — Antimicrobianos (piloto dos β-lactâmicos)

**Versão:** 23/09/2026 — segue o padrão de conteúdos v2
([`PADRAO-NEXUSMED-CONTEUDOS.md`](PADRAO-NEXUSMED-CONTEUDOS.md)).
**Escopo:** o que produzir, em que ordem e o que entregar à IA para cada
material. Não contém recomendação terapêutica — os tópicos listados em "Cobre"
são o recorte de cada material, não afirmações a publicar sem fonte.

Substitui a proposta de 2026-09-22 (`TAXONOMIA-ANTIBIOTICOS-PILOTO.md`, que
ficou só na cópia local do dono do produto): a árvore e o catálogo de 21
materiais continuam; saem as tabelas de "Estude antes"/"Veja também" e a coluna
"tipo" (não se preenchem mais), e a casa passa a ser Farmacologia.

---

## 1. Onde mora

```text
Disciplina (casa): Farmacologia
Tema:              Antimicrobianos
Raiz:              Antibióticos — visão geral
```

- **Por que Farmacologia:** fármaco e classe de fármaco moram onde o conceito é
  definido. Infectologia fica com o que é dela — pneumonia, meningite,
  infecção urinária, sepse, escolha empírica por síndrome — e menciona os
  fármacos sem reexplicá-los.
- **Infectologia, Pediatria e Terapia Intensiva** vão ver o ramo inteiro
  quando a plataforma ganhar o "também aparece em" (unidade 44-A de
  `docs/produto/PLANO-DE-DESENVOLVIMENTO.md`). Até lá, o estudante acha tudo pela
  busca. **Nunca copiar material para outra disciplina.**
- **Tema:** se "Antimicrobianos" ainda não existir em Farmacologia, crie-o na
  própria importação do primeiro material (menu do tema → "+ Criar novo
  tema...").

## 2. A árvore

```text
Antibióticos — visão geral
└── Inibidores da síntese da parede celular
    └── β-lactâmicos
        ├── Penicilinas
        │   ├── Penicilinas naturais
        │   ├── Penicilinas resistentes às penicilinases
        │   ├── Aminopenicilinas
        │   ├── Penicilinas antipseudomonas
        │   └── Penicilinas associadas a inibidores de β-lactamase
        ├── Cefalosporinas
        │   ├── Cefalosporinas de primeira geração
        │   ├── Cefalosporinas de segunda geração e cefamicinas
        │   ├── Cefalosporinas de terceira geração
        │   │   ├── Ceftriaxona
        │   │   └── Ceftazidima
        │   ├── Cefalosporinas de quarta geração
        │   ├── Cefalosporinas com atividade anti-MRSA
        │   └── Novas combinações de cefalosporina e inibidor
        ├── Carbapenêmicos
        ├── Monobactâmicos
        └── β-lactamases e seus inibidores
```

Só ceftriaxona e ceftazidima ganham material próprio no piloto: servem para
testar o último nível (fármaco) e a comparação entre irmãos. Os demais
fármacos entram como seção ou linha de tabela no material da subclasse. Um
fármaco só ganha material próprio quando tiver objetivo de estudo autônomo,
cerca de 8 minutos de conteúdo distintivo e diferenças que não caibam numa
tabela do pai.

**Ramos futuros** (fora do piloto, para planejar depois): sob "Antibióticos —
visão geral", os demais grupos por mecanismo — inibidores da síntese proteica,
da síntese e função dos ácidos nucleicos, da via do folato e agentes que atuam
na membrana; sob "Inibidores da síntese da parede celular", os glicopeptídeos.
No mesmo tema, outras raízes: antifúngicos, antivirais, antiparasitários.

## 3. Ordem de produção

Importar sempre **de cima para baixo** — o pai precisa existir para ser
escolhido.

**Primeira leva (piloto, 7 materiais — o caminho da raiz ao fármaco):**
1. Antibióticos — visão geral
2. Inibidores da síntese da parede celular
3. β-lactâmicos
4. Cefalosporinas
5. Cefalosporinas de terceira geração
6. Ceftriaxona
7. Ceftazidima

**Segunda leva:** β-lactamases e seus inibidores (antes das associações);
Penicilinas e suas cinco subclasses; as demais gerações de cefalosporinas;
Novas combinações; Carbapenêmicos; Monobactâmicos.

## 4. O rascunho existente

`docs/conteúdos/antimicrobianos/rascunho-antigo-completo.md` ("Antimicrobianos I:
Betalactâmicos", 25 min, em Infectologia; só na cópia local do dono, pasta
ignorada pelo git) cobre a classe inteira num material só e tem numeração no
título — não segue a v2. **Não importar como está.** Serve de matéria-prima:
entregue à IA a seção correspondente junto com o bloco do material.

| Seção do rascunho | Vai para |
|---|---|
| Conceitos Básicos, Histórico e Uso Racional | Antibióticos — visão geral |
| Arquitetura Bioquímica, Mecanismo de Ação e PK/PD | Inibidores da síntese da parede celular; β-lactâmicos |
| Propriedades Gerais da Classe e Mecanismos de Resistência | β-lactâmicos; β-lactamases e seus inibidores |
| Subclasse das Penicilinas | Penicilinas e subclasses |
| Subclasse das Cefalosporinas (1ª à 5ª Geração) | Cefalosporinas e gerações |
| Subclasses dos Carbapenêmicos e Monobactâmicos | Carbapenêmicos; Monobactâmicos |

Se esse rascunho já tiver sido importado na plataforma, não publique: ele é
substituído pelos materiais novos. Se já estiver publicado, avise antes de
qualquer mudança — pode haver questões ligadas a ele.

## 5. Como pedir cada material à IA

Anexe três coisas: o padrão (`PADRAO-NEXUSMED-CONTEUDOS.md`), as fontes e o
bloco do material (seção 6). Desde 24/09 quem escreve é o Gemini, e cada
arquivo passa por checagem e revisão cruzada antes de importar — fluxo na
seção 12 de `docs/produto/PLANO-DE-DESENVOLVIMENTO.md` (D-5). Mensagem sugerida:

```text
Siga o documento anexo (padrão NexusMed de conteúdos, versão 2) e produza o
material descrito no bloco abaixo, usando as fontes anexas. Entregue um único
arquivo .md no formato da seção 1.7 do padrão. Se faltar alguma informação,
pergunte antes de escrever.

[cole aqui o bloco do material]
```

Fontes de referência para o ramo (anexe as que tiver; prefira edições
recentes): Goodman & Gilman — As Bases Farmacológicas da Terapêutica;
Katzung — Farmacologia Básica e Clínica; Mandell, Douglas and Bennett's
Principles and Practice of Infectious Diseases; RENAME (disponibilidade no
SUS); BrCAST (pontos de corte de sensibilidade no Brasil). Para a
classificação dos grupos, o índice ATC/DDD da OMS (códigos J01C, J01CR,
J01D).

## 6. Blocos para a IA

Todos os blocos usam **Disciplina: Farmacologia** e **Tema: Antimicrobianos**.

### Antibióticos — visão geral

```text
Título: Antibióticos — visão geral
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: visão geral
Tempo-alvo: 15–20 minutos
Material acima (pai): nenhum — é a raiz do ramo
Materiais ao lado (irmãos): nenhum por enquanto
Materiais abaixo (filhos previstos): Inibidores da síntese da parede celular; no futuro, os demais grupos por mecanismo (síntese proteica, ácidos nucleicos, via do folato, membrana)
Cobre: conceitos que valem para todo antibiótico — bactericida e bacteriostático; espectro; concentração inibitória mínima (CIM); PK/PD (tempo-dependente, concentração-dependente, AUC/CIM); classificação por alvo e mecanismo (os grandes grupos, descritos como conteúdo); resistência como fenômeno (intrínseca e adquirida; inativação enzimática, alteração do alvo, redução de permeabilidade, efluxo); princípios do uso racional; breve histórico
Deixa para os materiais abaixo: o mecanismo detalhado de cada grupo e os fármacos
```

### Inibidores da síntese da parede celular

```text
Título: Inibidores da síntese da parede celular
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: classe
Tempo-alvo: 15–20 minutos
Material acima (pai): Antibióticos — visão geral
Materiais ao lado (irmãos): nenhum publicado ainda (virão os demais grupos por mecanismo)
Materiais abaixo (filhos previstos): β-lactâmicos; no futuro, Glicopeptídeos
Cobre: estrutura da parede bacteriana (peptidoglicano; diferenças entre Gram-positivas e Gram-negativas; membrana externa); etapas da síntese do peptidoglicano e em qual etapa cada grupo atua — β-lactâmicos (transpeptidação, PBPs), glicopeptídeos (ligação ao terminal D-Ala-D-Ala), fosfomicina (etapa citoplasmática) e bacitracina (reciclagem do carreador lipídico); por que esses agentes dependem de bactérias em crescimento; bactérias sem parede como resistência intrínseca. Fosfomicina e bacitracina ficam como seções aqui (sem material próprio previsto)
Deixa para os materiais abaixo: β-lactâmicos e glicopeptídeos em detalhe
```

### β-lactâmicos

```text
Título: β-lactâmicos
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: classe
Tempo-alvo: 15–20 minutos
Material acima (pai): Inibidores da síntese da parede celular
Materiais ao lado (irmãos): nenhum publicado ainda (virão os glicopeptídeos)
Materiais abaixo (filhos previstos): Penicilinas; Cefalosporinas; Carbapenêmicos; Monobactâmicos; β-lactamases e seus inibidores
Cobre: o anel β-lactâmico e os núcleos (penam, cefem, carbapenem, monobactam) como o que separa as subclasses; mecanismo compartilhado (ligação às PBPs, inibição da transpeptidação, autólise); PK/PD tempo-dependente e suas consequências gerais; propriedades farmacocinéticas comuns; segurança comum à classe (hipersensibilidade e o conceito de reatividade cruzada; neurotoxicidade); panorama da resistência (β-lactamases, alteração de PBP como no MRSA, porinas, efluxo); tabela comparativa das subclasses
Deixa para os materiais abaixo: cada subclasse em detalhe; classificação das β-lactamases e os inibidores
```

### Penicilinas

```text
Título: Penicilinas
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: classe
Tempo-alvo: 15–20 minutos
Material acima (pai): β-lactâmicos
Materiais ao lado (irmãos): Cefalosporinas; Carbapenêmicos; Monobactâmicos; β-lactamases e seus inibidores
Materiais abaixo (filhos previstos): Penicilinas naturais; Penicilinas resistentes às penicilinases; Aminopenicilinas; Penicilinas antipseudomonas; Penicilinas associadas a inibidores de β-lactamase
Cobre: o núcleo ácido 6-aminopenicilânico e como a cadeia lateral define espectro e estabilidade; a lógica das subclasses (cada uma responde a uma limitação da anterior: penicilinase, Gram-negativos, Pseudomonas, β-lactamases); farmacocinética comum (meia-vida curta, eliminação renal, secreção tubular); alergia à penicilina (tipos de reação, avaliação); tabela comparativa das subclasses
Deixa para os materiais abaixo: fármacos, espectro detalhado e usos de cada subclasse
```

### Penicilinas naturais

```text
Título: Penicilinas naturais
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: subclasse
Tempo-alvo: 12–18 minutos
Material acima (pai): Penicilinas
Materiais ao lado (irmãos): Penicilinas resistentes às penicilinases; Aminopenicilinas; Penicilinas antipseudomonas; Penicilinas associadas a inibidores de β-lactamase
Materiais abaixo (filhos previstos): nenhum
Fármacos: benzilpenicilinas (cristalina, procaína, benzatina); fenoximetilpenicilina, se pertinente ao contexto brasileiro
Cobre: espectro; como as formulações diferem na farmacocinética; usos clássicos em que ainda são escolha; contexto brasileiro (disponibilidade da benzatina, sífilis)
Deixa para outros materiais: o que é comum às penicilinas (está no pai)
```

### Penicilinas resistentes às penicilinases

```text
Título: Penicilinas resistentes às penicilinases
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: subclasse
Tempo-alvo: 12–18 minutos
Material acima (pai): Penicilinas
Materiais ao lado (irmãos): Penicilinas naturais; Aminopenicilinas; Penicilinas antipseudomonas; Penicilinas associadas a inibidores de β-lactamase
Materiais abaixo (filhos previstos): nenhum
Fármacos: oxacilina; meticilina como referência histórica (origem do termo MRSA); outros conforme a disponibilidade no Brasil
Cobre: por que resistem à penicilinase estafilocócica; espectro restrito; estafilococo sensível e resistente à oxacilina (PBP2a, gene mecA) e o que isso significa para toda a classe; ausência de atividade contra Gram-negativos
Deixa para outros materiais: o que é comum às penicilinas (está no pai)
```

### Aminopenicilinas

```text
Título: Aminopenicilinas
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: subclasse
Tempo-alvo: 12–18 minutos
Material acima (pai): Penicilinas
Materiais ao lado (irmãos): Penicilinas naturais; Penicilinas resistentes às penicilinases; Penicilinas antipseudomonas; Penicilinas associadas a inibidores de β-lactamase
Materiais abaixo (filhos previstos): nenhum
Fármacos: amoxicilina; ampicilina
Cobre: o que o grupo amino acrescenta ao espectro; diferenças de farmacocinética entre amoxicilina e ampicilina; sensibilidade às β-lactamases (motivo das associações, que são material irmão); organismos em que se destacam (enterococo, Listeria); exantema na mononucleose
Deixa para outros materiais: as associações com inibidores (material irmão)
```

### Penicilinas antipseudomonas

```text
Título: Penicilinas antipseudomonas
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: subclasse
Tempo-alvo: 12–18 minutos
Material acima (pai): Penicilinas
Materiais ao lado (irmãos): Penicilinas naturais; Penicilinas resistentes às penicilinases; Aminopenicilinas; Penicilinas associadas a inibidores de β-lactamase
Materiais abaixo (filhos previstos): nenhum
Fármacos: piperacilina (ureidopenicilina); carboxipenicilinas como referência histórica
Cobre: o que permite a atividade contra Pseudomonas; por que no Brasil a piperacilina é usada associada ao tazobactam
Deixa para outros materiais: piperacilina–tazobactam (material irmão das associações)
Atenção: se não houver conteúdo distintivo para cerca de 8 minutos, este material não é criado e o assunto vira seção de "Penicilinas" — avise em vez de preencher
```

### Penicilinas associadas a inibidores de β-lactamase

```text
Título: Penicilinas associadas a inibidores de β-lactamase
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: subclasse
Tempo-alvo: 15–20 minutos
Material acima (pai): Penicilinas
Materiais ao lado (irmãos): Penicilinas naturais; Penicilinas resistentes às penicilinases; Aminopenicilinas; Penicilinas antipseudomonas
Materiais abaixo (filhos previstos): nenhum
Fármacos: amoxicilina–clavulanato; ampicilina–sulbactam; piperacilina–tazobactam
Cobre: o que cada associação acrescenta ao espectro (produtores de β-lactamase, anaeróbios); diferenças entre as três; atividade própria do sulbactam contra Acinetobacter; limites (ESBL, AmpC, carbapenemases)
Deixa para outros materiais: como os inibidores funcionam e a classificação das β-lactamases (material "β-lactamases e seus inibidores", ramo vizinho)
```

### Cefalosporinas

```text
Título: Cefalosporinas
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: classe
Tempo-alvo: 15–20 minutos
Material acima (pai): β-lactâmicos
Materiais ao lado (irmãos): Penicilinas; Carbapenêmicos; Monobactâmicos; β-lactamases e seus inibidores
Materiais abaixo (filhos previstos): Cefalosporinas de primeira geração; Cefalosporinas de segunda geração e cefamicinas; Cefalosporinas de terceira geração; Cefalosporinas de quarta geração; Cefalosporinas com atividade anti-MRSA; Novas combinações de cefalosporina e inibidor
Cobre: o núcleo 7-ACA; a lógica das gerações e seus limites como classificação; lacunas comuns à classe (enterococo, Listeria, atípicos; MRSA, exceto os agentes anti-MRSA); farmacocinética geral (orais e parenterais; penetração no sistema nervoso central); segurança (reatividade cruzada com penicilinas pela cadeia lateral; efeitos ligados à cadeia N-metiltiotetrazol); tabela comparativa das gerações
Deixa para os materiais abaixo: fármacos e usos de cada geração
```

### Cefalosporinas de primeira geração

```text
Título: Cefalosporinas de primeira geração
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: subclasse
Tempo-alvo: 12–18 minutos
Material acima (pai): Cefalosporinas
Materiais ao lado (irmãos): Cefalosporinas de segunda geração e cefamicinas; Cefalosporinas de terceira geração; Cefalosporinas de quarta geração; Cefalosporinas com atividade anti-MRSA; Novas combinações de cefalosporina e inibidor
Materiais abaixo (filhos previstos): nenhum
Fármacos: cefalexina; cefadroxila; cefazolina; cefalotina
Cobre: espectro; diferenças entre orais e parenterais; papel na profilaxia cirúrgica e nas infecções de pele; limitações
Deixa para outros materiais: o que é comum às cefalosporinas (está no pai)
```

### Cefalosporinas de segunda geração e cefamicinas

```text
Título: Cefalosporinas de segunda geração e cefamicinas
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: subclasse
Tempo-alvo: 15–20 minutos
Material acima (pai): Cefalosporinas
Materiais ao lado (irmãos): Cefalosporinas de primeira geração; Cefalosporinas de terceira geração; Cefalosporinas de quarta geração; Cefalosporinas com atividade anti-MRSA; Novas combinações de cefalosporina e inibidor
Materiais abaixo (filhos previstos): nenhum
Fármacos: cefaclor; cefuroxima; cefoxitina
Cobre: o ganho de espectro em relação à primeira geração (Haemophilus, Moraxella); as cefamicinas e a atividade contra anaeróbios; por que as duas ficam no mesmo material
Deixa para outros materiais: o que é comum às cefalosporinas (está no pai)
```

### Cefalosporinas de terceira geração

```text
Título: Cefalosporinas de terceira geração
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: subclasse
Tempo-alvo: 15–20 minutos
Material acima (pai): Cefalosporinas
Materiais ao lado (irmãos): Cefalosporinas de primeira geração; Cefalosporinas de segunda geração e cefamicinas; Cefalosporinas de quarta geração; Cefalosporinas com atividade anti-MRSA; Novas combinações de cefalosporina e inibidor
Materiais abaixo (filhos previstos): Ceftriaxona; Ceftazidima
Fármacos: ceftriaxona; cefotaxima; ceftazidima (cefotaxima fica como seção, sem material próprio)
Cobre: o que une a geração (estabilidade a várias β-lactamases, atividade contra Gram-negativos, penetração no sistema nervoso central); a divisão entre as com e sem atividade antipseudomonas; seleção de resistência (AmpC, ESBL) como conceito; o que distingue ceftriaxona e ceftazidima, em uma frase cada
Deixa para os materiais abaixo: as particularidades de ceftriaxona e ceftazidima
```

### Ceftriaxona

```text
Título: Ceftriaxona
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: fármaco individual
Tempo-alvo: 8–12 minutos
Material acima (pai): Cefalosporinas de terceira geração
Materiais ao lado (irmãos): Ceftazidima
Materiais abaixo (filhos previstos): nenhum
Cobre: SOMENTE o que distingue a ceftriaxona — farmacocinética (meia-vida longa, eliminação biliar e renal); penetração no sistema nervoso central; lama biliar e pseudolitíase; restrições no recém-nascido (cálcio, bilirrubina); situações em que se destaca
Deixa para outros materiais: mecanismo e espectro da geração (estão no pai) — cite em uma frase e siga
```

### Ceftazidima

```text
Título: Ceftazidima
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: fármaco individual
Tempo-alvo: 8–12 minutos
Material acima (pai): Cefalosporinas de terceira geração
Materiais ao lado (irmãos): Ceftriaxona
Materiais abaixo (filhos previstos): nenhum
Cobre: SOMENTE o que distingue a ceftazidima — atividade antipseudomonas; atividade fraca contra Gram-positivos (contraste com a ceftriaxona); eliminação renal e ajuste; situações em que se destaca; é a base da ceftazidima–avibactam (mencionar, sem aprofundar)
Deixa para outros materiais: mecanismo e espectro da geração (estão no pai); a associação com avibactam (outro material)
```

### Cefalosporinas de quarta geração

```text
Título: Cefalosporinas de quarta geração
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: subclasse
Tempo-alvo: 12–18 minutos
Material acima (pai): Cefalosporinas
Materiais ao lado (irmãos): Cefalosporinas de primeira geração; Cefalosporinas de segunda geração e cefamicinas; Cefalosporinas de terceira geração; Cefalosporinas com atividade anti-MRSA; Novas combinações de cefalosporina e inibidor
Materiais abaixo (filhos previstos): nenhum
Fármacos: cefepima
Cobre: por que penetra melhor em Gram-negativos; maior estabilidade frente a AmpC; espectro que soma Pseudomonas e Gram-positivos; neurotoxicidade, sobretudo na insuficiência renal
Deixa para outros materiais: o que é comum às cefalosporinas (está no pai)
```

### Cefalosporinas com atividade anti-MRSA

```text
Título: Cefalosporinas com atividade anti-MRSA
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: subclasse
Tempo-alvo: 12–18 minutos
Material acima (pai): Cefalosporinas
Materiais ao lado (irmãos): Cefalosporinas de primeira geração; Cefalosporinas de segunda geração e cefamicinas; Cefalosporinas de terceira geração; Cefalosporinas de quarta geração; Novas combinações de cefalosporina e inibidor
Materiais abaixo (filhos previstos): nenhum
Fármacos: ceftarolina; ceftobiprol conforme disponibilidade no Brasil
Cobre: afinidade pela PBP2a e o que isso muda; espectro; a denominação "quinta geração", comum no Brasil
Deixa para outros materiais: o que é comum às cefalosporinas (está no pai)
```

### Novas combinações de cefalosporina e inibidor

```text
Título: Novas combinações de cefalosporina e inibidor
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: subclasse
Tempo-alvo: 15–20 minutos
Material acima (pai): Cefalosporinas
Materiais ao lado (irmãos): Cefalosporinas de primeira geração; Cefalosporinas de segunda geração e cefamicinas; Cefalosporinas de terceira geração; Cefalosporinas de quarta geração; Cefalosporinas com atividade anti-MRSA
Materiais abaixo (filhos previstos): nenhum
Fármacos: ceftazidima–avibactam; ceftolozana–tazobactam
Cobre: o que cada uma resolve (carbapenemases como KPC e OXA-48; Pseudomonas multirresistente); limites (metalo-β-lactamases); uso restrito e o papel do controle de antimicrobianos
Deixa para outros materiais: como os inibidores funcionam e a classificação das β-lactamases (material "β-lactamases e seus inibidores", ramo vizinho)
```

### Carbapenêmicos

```text
Título: Carbapenêmicos
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: classe
Tempo-alvo: 15–20 minutos
Material acima (pai): β-lactâmicos
Materiais ao lado (irmãos): Penicilinas; Cefalosporinas; Monobactâmicos; β-lactamases e seus inibidores
Materiais abaixo (filhos previstos): nenhum
Fármacos: imipenem–cilastatina; meropenem; ertapenem
Cobre: o espectro mais amplo entre os β-lactâmicos; estabilidade frente a ESBL e AmpC; o ertapenem e suas lacunas (Pseudomonas, Acinetobacter) em contraste com os demais; por que o imipenem vem com cilastatina; convulsões; interação com ácido valproico; carbapenemases como ameaça (conceito); uso restrito
Deixa para outros materiais: a classificação das carbapenemases (material "β-lactamases e seus inibidores")
```

### Monobactâmicos

```text
Título: Monobactâmicos
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: classe
Tempo-alvo: 10–15 minutos
Material acima (pai): β-lactâmicos
Materiais ao lado (irmãos): Penicilinas; Cefalosporinas; Carbapenêmicos; β-lactamases e seus inibidores
Materiais abaixo (filhos previstos): nenhum
Fármacos: aztreonam
Cobre: a estrutura monocíclica; espectro restrito a Gram-negativos aeróbios; baixa reatividade cruzada com os demais β-lactâmicos e a exceção da ceftazidima (cadeia lateral em comum); estabilidade frente a metalo-β-lactamases e a associação com avibactam (mencionar)
Deixa para outros materiais: a classificação das β-lactamases
```

### β-lactamases e seus inibidores

```text
Título: β-lactamases e seus inibidores
Disciplina: Farmacologia
Tema: Antimicrobianos
Nível: classe
Tempo-alvo: 15–20 minutos
Material acima (pai): β-lactâmicos
Materiais ao lado (irmãos): Penicilinas; Cefalosporinas; Carbapenêmicos; Monobactâmicos
Materiais abaixo (filhos previstos): nenhum
Cobre: a classificação de Ambler (classes A, B, C e D) e o que cada uma hidrolisa; ESBL, AmpC e carbapenemases (KPC, metalo-β-lactamases como NDM, VIM e IMP, OXA-48); os inibidores clássicos (clavulanato, sulbactam, tazobactam) e os novos (avibactam; vaborbactam e relebactam conforme disponibilidade) — o que cada um inibe e o que não inibe; como a resistência é detectada no laboratório (conceito); contexto brasileiro de resistência
Deixa para outros materiais: as particularidades de cada associação comercial (estão nos materiais das associações)
```

## 7. Decisões tomadas

- **Casa em Farmacologia**, tema Antimicrobianos (2026-09-23).
- **β-lactamases e seus inibidores fica dentro de β-lactâmicos.** O mecanismo
  é definido na farmacologia dos β-lactâmicos. Se um dia existir uma área de
  resistência bacteriana, o ramo pode ser mostrado também lá, sem mudar de
  casa.
- **Sem "Estude antes"/"Veja também".** A ligação com materiais clínicos (por
  exemplo, "Meningite bacteriana", em Infectologia) vem das questões que
  cobram os dois.
- **Penicilinas antipseudomonas** pode deixar de existir como material se não
  tiver conteúdo distintivo suficiente (ver o bloco).
