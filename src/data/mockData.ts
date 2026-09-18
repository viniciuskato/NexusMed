import { Discipline, Theme, Compendium, Question, Flashcard } from '../types';

export const INITIAL_DISCIPLINES: Discipline[] = [
  {
    id: 'cardio',
    name: 'Cardiologia',
    code: 'CARD',
    icon: 'HeartPulse',
    description: 'Fisiopatologia, diagnóstico e condutas em emergências e ambulatório cardiovascular.',
    cycle: 'clinico',
    color: 'from-rose-500 to-red-600',
    themesCount: 3,
  },
  {
    id: 'pneumo',
    name: 'Pneumologia',
    code: 'PNEU',
    icon: 'Activity',
    description: 'Doenças obstrutivas, restritivas, infecciosas e mecânica ventilatória.',
    cycle: 'clinico',
    color: 'from-sky-500 to-blue-600',
    themesCount: 2,
  },
  {
    id: 'infecto',
    name: 'Infectologia',
    code: 'INFECT',
    icon: 'ShieldAlert',
    description: 'Sepse, antibioticoterapia racional, infecções sistêmicas e tropicais.',
    cycle: 'clinico',
    color: 'from-amber-500 to-orange-600',
    themesCount: 2,
  },
  {
    id: 'farmaco',
    name: 'Farmacologia Clínica',
    code: 'FARM',
    icon: 'Pill',
    description: 'Farmacodinâmica, alvos moleculares, interações e farmacocinética aplicada.',
    cycle: 'basico',
    color: 'from-emerald-500 to-teal-600',
    themesCount: 2,
  },
  {
    id: 'fisio',
    name: 'Fisiologia & Fisiopatologia',
    code: 'FISIO',
    icon: 'Microscope',
    description: 'Bases celulares e orgânicas da homeostase e mecanismos de descompensação.',
    cycle: 'basico',
    color: 'from-indigo-500 to-violet-600',
    themesCount: 2,
  },
  {
    id: 'gastro',
    name: 'Gastroenterologia & Hepatologia',
    code: 'GASTRO',
    icon: 'Stethoscope',
    description: 'Doenças do trato digestivo, insuficiência hepática e abdome agudo.',
    cycle: 'clinico',
    color: 'from-purple-500 to-pink-600',
    themesCount: 2,
  },
];

export const INITIAL_THEMES: Theme[] = [
  // Cardiologia
  {
    id: 'cardio-ic',
    disciplineId: 'cardio',
    name: 'Insuficiência Cardíaca (ICFEr e ICFEp)',
    description: 'Fisiopatologia neuro-humoral, critérios de Framingham e o quarteto fantástico farmacológico.',
    highYield: true,
    order: 1,
  },
  {
    id: 'cardio-sca',
    disciplineId: 'cardio',
    name: 'Síndromes Coronarianas Agudas (SCA)',
    description: 'Infarto com e sem supra de ST, estratificação de risco (GRACE/TIMI) e terapia de reperfusão.',
    highYield: true,
    order: 2,
  },
  {
    id: 'cardio-has',
    disciplineId: 'cardio',
    name: 'Hipertensão Arterial Sistêmica (HAS)',
    description: 'Classificação, lesões de órgãos-alvo e escolha individualizada de anti-hipertensivos.',
    highYield: false,
    order: 3,
  },
  // Pneumologia
  {
    id: 'pneumo-asma',
    disciplineId: 'pneumo',
    name: 'Asma Brônquica',
    description: 'Inflamação das vias aéreas, estadiamento GINA e resgate inteligente com CI + Formoterol.',
    highYield: true,
    order: 1,
  },
  {
    id: 'pneumo-dpoc',
    disciplineId: 'pneumo',
    name: 'Doença Pulmonar Obstrutiva Crônica (DPOC)',
    description: 'Fenótipos clínicos, espirometria pós-broncodilatador, classificação GOLD ABE e exacerbações.',
    highYield: true,
    order: 2,
  },
  // Infectologia
  {
    id: 'infecto-sepse',
    disciplineId: 'infecto',
    name: 'Sepse e Choque Séptico',
    description: 'Definições Sepsis-3, escore SOFA, pacote da primeira hora e uso precoce de noradrenalina.',
    highYield: true,
    order: 1,
  },
  {
    id: 'infecto-pac',
    disciplineId: 'infecto',
    name: 'Pneumonia Adquirida na Comunidade (PAC)',
    description: 'Estratificação com CURB-65 / CRB-65 e esquemas antimicrobianos empíricos.',
    highYield: true,
    order: 2,
  },
  // Farmacologia
  {
    id: 'farmaco-atb',
    disciplineId: 'farmaco',
    name: 'Mecanismos de Ação de Antimicrobianos',
    description: 'Inibidores de parede celular, síntese proteica, DNA girase e mecanismos de resistência.',
    highYield: true,
    order: 1,
  },
  {
    id: 'farmaco-sraa',
    disciplineId: 'farmaco',
    name: 'Bloqueadores do Sistema Renina-Angiotensina (SRAA)',
    description: 'iECA vs BRA, inibidores de neprilisina (ARNI) e impactos hemodinâmicos glomerulares.',
    highYield: false,
    order: 2,
  },
  // Fisiologia
  {
    id: 'fisio-renal',
    disciplineId: 'fisio',
    name: 'Fisiologia e Hemodinâmica Glomerular',
    description: 'Feedback tubuloglomerular, autorregulação renal da arteríola aferente/eferente e filtração.',
    highYield: true,
    order: 1,
  },
  {
    id: 'fisio-ciclo-card',
    disciplineId: 'fisio',
    name: 'Ciclo Cardíaco e Curvas de Pressão-Volume',
    description: 'Sístole, diástole, complacência ventricular e lei de Frank-Starling.',
    highYield: false,
    order: 2,
  },
  // Gastroenterologia
  {
    id: 'gastro-cirrose',
    disciplineId: 'gastro',
    name: 'Cirrose Hepática e Hipertensão Portal',
    description: 'Fisiopatologia da hipertensão portal, ascite, peritonite bacteriana espontânea e sangramento varicoso.',
    highYield: true,
    order: 1,
  },
];

export const INITIAL_COMPENDIUMS: Compendium[] = [
  {
    id: 'comp-cardio-ic',
    disciplineId: 'cardio',
    themeId: 'cardio-ic',
    title: 'Insuficiência Cardíaca com Fração de Ejeção Reduzida (ICFEr)',
    subtitle: 'Fisiopatologia neuro-humoral, remodelamento ventricular e o Quarteto Terapêutico Fundamental',
    estimatedReadTimeMinutes: 12,
    lastUpdated: '2026-08-15',
    author: 'Conteúdo de demonstração (fictício)',
    references: [
      'Diretriz Brasileira de Insuficiência Cardíaca - SBC (2024)',
      '2023 Focused Update of the 2021 ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure',
      'Braunwald’s Heart Disease: A Textbook of Cardiovascular Medicine, 12th Ed.',
    ],
    sections: [
      {
        id: 'sec-ic-fisio',
        title: '1. Mecanismo Fisiopatológico & Remodelamento Neuro-Humoral',
        mechanismTag: 'Fisiopatologia & Mecanismo',
        content: `A **Insuficiência Cardíaca com Fração de Ejeção Reduzida (ICFEr, FEVE ≤ 40%)** inicia-se após uma agressão miocárdica índice (ex: infarto agudo do miocárdio, cardiomiopatia dilatada, hipertensão de longa data).

O dano inicial reduz o volume sistólico e o débito cardíaco, desencadeando respostas compensatórias desadaptativas crônicas:

1. **Ativação do Sistema Nervoso Simpático (SNS)**:
   - Aumento crônico de noradrenalina causa vasoconstrição periférica, taquicardia e apoptose de cardiomiócitos por sobrecarga intracelular de cálcio.
   - Ocorre *down-regulation* dos receptores beta-1 adrenérgicos miocárdicos.

2. **Ativação do Sistema Renina-Angiotensina-Aldosterona (SRAA)**:
   - A hipoperfusão renal estimula as células justaglomerulares a secretar renina.
   - **Angiotensina II**: Potente vasoconstritor arteriolar e indutor direto de fibrose miocárdica e apoptose celular.
   - **Aldosterona**: Promove retenção de sódio/água e estimula a deposição de colágeno intersticial (fibrose miocárdica e vascular).

3. **Sistema dos Peptídeos Natriuréticos (BNP/ANP)**:
   - Secretados em resposta ao estiramento miocárdico parietal. Promovem natriurese e vasodilatação, mas sua ação é atenuada na IC crônica pela rápida degradação enzimática pela **Neprilisina**.`,
        keyTakeaways: [
          'A ativação neuro-humoral crônica (SNS e SRAA) é citotóxica para o miocárdio e gera remodelamento adverso.',
          'O remodelamento inclui hipertrofia excêntrica, apoptose de cardiomiócitos e fibrose intersticial.',
          'Drogas que apenas aumentam a contratilidade (inotrópicos) aumentam a mortalidade; o bloqueio neuro-humoral é o pilar que salva vidas.',
        ],
        clinicalPearl: 'O BNP elevado (>100 pg/mL) ou NT-proBNP (>300 pg/mL) tem excelente valor preditivo negativo para excluir causa cardíaca em pacientes com dispneia aguda no pronto-socorro.',
      },
      {
        id: 'sec-ic-terapia',
        title: '2. Terapêutica Farmacológica Modificadora de Sobrevida (O Quarteto Fantástico)',
        mechanismTag: 'Farmacologia & Conduta',
        content: `Todas as diretrizes contemporâneas (SBC, ESC, AHA) estabelecem que **quatro classes farmacológicas** devem ser iniciadas o mais precocemente possível para todos os pacientes com ICFEr sintomáticos (NYHA II-IV), pois demonstraram redução robusta e independente da mortalidade cardiovascular e reinternações:

| Classe Farmacológica | Fármacos de Escolha | Mecanismo de Proteção |
| :--- | :--- | :--- |
| **1. ARNI (Inibidor de Neprilisina + BRA)** ou iECA/BRA | **Sacubitril/Valsartana** (preferencial) ou Enalapril / Ramipril | Aumenta peptídeos natriuréticos endógenos e bloqueia receptor AT1 da angiotensina II. Reduz remodelamento e morte súbita. |
| **2. Betabloqueadores** (apenas 3 aprovados!) | **Carvedilol**, **Succinato de Metoprolol** ou **Bisoprolol** | Bloqueia a toxicidade miocárdica simpática crônica, reduz consumo de O2 e reverte o remodelamento ventricular. |
| **3. Antagonistas de Receptor Mineralocorticoide (ARM)** | **Espironolactona** (25-50 mg/dia) | Bloqueia aldosterona, impedindo fibrose miocárdica e perda urinária de potássio/magnésio. |
| **4. Inibidores de SGLT2 (Gliflozinas)** | **Dapagliflozina** (10 mg/dia) ou **Empagliflozina** (10 mg/dia) | Reduz pré e pós-carga, melhora metabolismo energético cardíaco miocárdico e preserva função renal independentemente de diabetes! |`,
        keyTakeaways: [
          'O Succinato de Metoprolol é eficaz na IC, mas o Tartarato de Metoprolol NÃO tem evidência de redução de mortalidade.',
          'Os iSGLT2 (Dapa e Empa) reduzem mortalidade e hospitalização na ICFEr mesmo em pacientes NÃO DIABÉTICOS.',
          'Para trocar iECA por Sacubitril/Valsartana, é OBRIGATÓRIO aguardar washout de 36 horas para prevenir angioedema grave.',
        ],
        clinicalPearl: 'Ao iniciar Sacubitril/Valsartana, meça o NT-proBNP para acompanhar resposta, pois o BNP convencional sobe artificialmente (já que a neprilisina inibida não mais o degrada).',
        warningAlert: 'Atenção: Diuréticos de alça (Furosemida) e Digitálicos (Digoxina) aliviam sintomas e reduzem internação, mas NÃO reduzem mortalidade na ICFEr.',
      },
      {
        id: 'sec-ic-diagnostico',
        title: '3. Critérios Diagnósticos de Framingham & Estadiamento',
        mechanismTag: 'Critérios Diagnósticos',
        content: `O diagnóstico clínico de IC requer **2 critérios maiores** OU **1 critério maior + 2 menores**:

- **Critérios Maiores**: Dispneia paroxística noturna, turgência jugular patológica a 45°, estertores crepitantes pulmonares, cardiomegalia no RX de tórax, edema agudo de pulmão, terceira bulha (B3 - som de galope por sobrecarga de volume ventricular), refluxo hepatojugular.
- **Critérios Menores**: Edema maleolar bilateral, tosse noturna, dispneia a esforços habituais, hepatomegalia, derrame pleural, taquicardia (>120 bpm), perda ponderal >4,5 kg em 5 dias de diurético.`,
        keyTakeaways: [
          'A presença de B3 é altamente específica para disfunção sistólica com sobrecarga volumétrica ventricular esquerda.',
          'O ecocardiograma transtorácico com Doppler é o exame fundamental para diferenciar ICFEr (FE ≤ 40%), ICFEi (FE 41-49%) e ICFEp (FE ≥ 50%).',
        ],
      },
    ],
  },
  {
    id: 'comp-pneumo-asma',
    disciplineId: 'pneumo',
    themeId: 'pneumo-asma',
    title: 'Asma Brônquica: Fisiopatologia, GINA 2024 e Manejo',
    subtitle: 'Inflamação Th2, hiper-responsividade brônquica e a revolução da terapia MART com CI + Formoterol',
    estimatedReadTimeMinutes: 10,
    lastUpdated: '2026-08-10',
    author: 'Conteúdo de demonstração (fictício)',
    references: [
      'Global Initiative for Asthma (GINA) Global Strategy for Asthma Management and Prevention (2024 Update)',
      'Diretrizes da Sociedade Brasileira de Pneumologia e Tisiologia para o Manejo da Asma (2023)',
    ],
    sections: [
      {
        id: 'sec-asma-fisio',
        title: '1. Mecanismo Fisiopatológico & Via Inflamatória Tipo 2',
        mechanismTag: 'Fisiopatologia & Imunologia',
        content: `A asma é uma doença inflamatória crônica heterogênea das vias aéreas inferiores caracterizada por limitação variável ao fluxo aéreo expiratório e hiper-responsividade brônquica.

Na maioria dos pacientes (fenótipo inflamatório T2-high):
- Alérgenos ativam células dendríticas, estimulando linfócitos **Th2** e células linfoides inatas tipo 2 (ILC2).
- Produção de citocinas inflamatórias chave:
  - **IL-4 e IL-13**: Estimulam os linfócitos B a realizarem *switch* de isotipo para **IgE** e induzem hiperplasia de células caliciformes com hipersecreção de muco.
  - **IL-5**: Principal fator de maturação, diferenciação, recrutamento e sobrevida de **eosinófilos** teciduais.
- A degranulação de mastócitos libera histamina, leucotrienos C4/D4/E4 e prostaglandina D2, gerando broncoespasmo agudo, edema de mucosa e espessamento da membrana basal brônquica.`,
        keyTakeaways: [
          'O broncoespasmo é apenas o evento final; a base subjacente é a inflamação crônica mediada por citocinas e eosinófilos.',
          'O uso isolado de SABA (Salbutamol) trata o sintoma agudo sem combater a inflamação, aumentando o risco de exacerbação grave e morte por asma.',
        ],
        clinicalPearl: 'Na espirometria, a reversibilidade diagnóstica é definida pelo aumento do VEF1 ≥ 12% e ≥ 200 mL após a inalação de 400 mcg de broncodilatador de curta ação.',
      },
      {
        id: 'sec-asma-gina',
        title: '2. Estratégia Terapêutica GINA (Track 1 Preferencial)',
        mechanismTag: 'Farmacologia & Conduta',
        content: `Desde as atualizações do GINA, a abordagem de escolha (**Track 1**) utiliza a combinação de **Corticoide Inalatório (CI) em dose baixa + Formoterol** (um LABA de início de ação ultra-rápido em 1-3 minutos) como **resgate e manutenção**:

- **Etapas 1 e 2**: CI + Formoterol em dose baixa usado estritamente **conforme a necessidade** (resgate).
- **Etapa 3**: CI + Formoterol em dose baixa como **manutenção diária fixa (1-2x/dia) + resgate** com a mesma medicação (estratégia MART - *Maintenance and Reliever Therapy*).
- **Etapa 4**: CI + Formoterol em dose intermediária como manutenção + resgate.
- **Etapa 5**: CI + Formoterol em dose alta + avaliação de fenótipo para imunobiológicos (anti-IgE como Omalizumabe, anti-IL5 como Mepolizumabe/Benralizumabe, ou anti-IL4R como Dupilumabe) ou LAMA (Tiotrópio).`,
        keyTakeaways: [
          'O Formoterol é o único LABA que pode ser usado como medicação de alívio rápido devido ao seu início de ação em 1-3 minutos (semelhante ao salbutamol).',
          'A estratégia SMART/MART garante que toda vez que o paciente inala broncodilatador para alívio do sintoma, ele recebe simultaneamente uma dose anti-inflamatória de corticoide inalatório.',
        ],
        warningAlert: 'Nunca prescrever LABA em monoterapia (sem corticoide) para asma. Isso aumenta o risco de crises fatais de broncoespasmo.',
      },
    ],
  },
  {
    id: 'comp-infecto-sepse',
    disciplineId: 'infecto',
    themeId: 'infecto-sepse',
    title: 'Sepse e Choque Séptico: Definições Sepsis-3 e Manejo Intensivo',
    subtitle: 'Critérios SOFA, pacote da primeira hora, ressuscitação hemodinâmica e aminas vasoativas',
    estimatedReadTimeMinutes: 14,
    lastUpdated: '2026-08-18',
    author: 'Conteúdo de demonstração (fictício)',
    references: [
      'Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock 2021/2023',
      'The Third International Consensus Definitions for Sepsis and Septic Shock (Sepsis-3) - JAMA',
    ],
    sections: [
      {
        id: 'sec-sepse-def',
        title: '1. Definições Sepsis-3 & Escore SOFA',
        mechanismTag: 'Conceitos & Fisiopatologia',
        content: `De acordo com o consenso internacional **Sepsis-3**:

- **Sepse**: Disfunção orgânica potencialmente fatal causada por uma resposta desregulada do hospedeiro à infecção.
  - Critério operacional: Aumento agudo de **≥ 2 pontos no escore SOFA** (*Sequential Organ Failure Assessment*) atribuível ao quadro infeccioso.
- **Choque Séptico**: Subgrupo da sepse no qual anormalidades circulatórias e celulares/metabólicas são profundas o suficiente para aumentar substancialmente a mortalidade.
  - Critérios operacionais (ambos presentes):
    1. **Hipotensão persistente** necessitando de vasopressor para manter **Pressão Arterial Média (PAM) ≥ 65 mmHg** mesmo após ressuscitação volêmica adequada;
    2. **Lactato sérico > 2,0 mmol/L (> 18 mg/dL)** persistente apesar de infusão de volume.

### Os 6 Domínios do Escore SOFA:
1. **Respiratório**: Relação PaO2/FiO2
2. **Coagulação**: Plaquetas (plaquetopenia)
3. **Hepático**: Bilirrubinas totais
4. **Cardiovascular**: Nível pressórico e dose de vasopressores/inotrópicos
5. **Neurológico**: Escala de Coma de Glasgow
6. **Renal**: Creatinina sérica e débito urinário diário`,
        keyTakeaways: [
          'A SIRS (Síndrome da Resposta Inflamatória Sistêmica) não é mais critério definidor de sepse pelo Sepsis-3 por ser inespecífica.',
          'O qSOFA (FR ≥ 22 irpm, Glasgow < 15, PAS ≤ 100 mmHg) é uma ferramenta de triagem à beira do leito para identificar pacientes com risco de desfecho desfavorável, mas NÃO diagnostica sepse isoladamente.',
        ],
        clinicalPearl: 'O lactato elevado reflete hipoperfusão tecidual sistêmica e glicólise anaeróbia acelerada por estimulação adrenérgica. Sua depuração (clearance de lactato) é meta de ressuscitação.',
      },
      {
        id: 'sec-sepse-hora-1',
        title: '2. Pacote da Primeira Hora (Hour-1 Bundle)',
        mechanismTag: 'Conduta & Terapêutica',
        content: `As condutas do pacote da primeira hora devem ser iniciadas **imediatamente**:

1. **Dosar Lactato Sérico**: Remensurar em 2 a 4 horas para avaliar clearance se inicial > 2 mmol/L.
2. **Coletar Hemoculturas (2 sítios diferentes)**: Antes de iniciar antibiótico, desde que a coleta não atrase o início da medicação em mais de 45 minutos.
3. **Iniciar Antibióticos de Amplo Espectro na 1ª Hora**: Cada hora de atraso no choque séptico aumenta a mortalidade em até 7-8%.
4. **Ressuscitação Volêmica com Cristaloides (30 mL/kg nas primeiras 3 horas)**: Indicada para pacientes com hipotensão (PAM < 65 mmHg) ou lactato ≥ 4 mmol/L. Preferir soluções balanceadas (Ringer Lactato ou Plasma-Lyte) sobre Soro Fisiológico 0,9% (que causa acidose hiperclorêmica e vasoconstrição renal).
5. **Iniciar Vasopressor Precoce**: **Noradrenalina** é a droga vasopressora de primeira linha de escolha se a PAM continuar < 65 mmHg durante ou logo após a infusão volêmica inicial.`,
        keyTakeaways: [
          'Noradrenalina é o vasopressor de 1ª escolha (alfa-1 agonista potente com modesto efeito beta-1).',
          'Se a dose de noradrenalina estiver em ascensão (ex: > 0,25 mcg/kg/min), adicionar precocemente Vasopressina (0,03 U/min fixa) como 2º vasopressor poupador de catecolamina.',
          'Corticoides (Hidrocortisona 200 mg/dia em infusão contínua ou 50 mg 6/6h) só estão indicados no choque séptico refratário a vasopressores.',
        ],
        warningAlert: 'Dopamina não é recomendada como droga de 1ª linha devido ao alto risco de arritmias taquicárdicas graves e maior mortalidade em comparação à noradrenalina.',
      },
    ],
  },
  {
    id: 'comp-farmaco-atb',
    disciplineId: 'farmaco',
    themeId: 'farmaco-atb',
    title: 'Mecanismos Moleculares de Antimicrobianos & Resistência',
    subtitle: 'Inibidores de parede bacteriana, síntese de proteínas ribossômicas e topoisomerases',
    estimatedReadTimeMinutes: 11,
    lastUpdated: '2026-08-05',
    author: 'Conteúdo de demonstração (fictício)',
    references: [
      'Goodman & Gilman: As Bases Farmacológicas da Terapêutica, 14ª Ed.',
      'Sanford Guide to Antimicrobial Therapy 2024',
    ],
    sections: [
      {
        id: 'sec-atb-parede',
        title: '1. Inibidores da Síntese da Parede Celular (Betalactâmicos e Glicopeptídeos)',
        mechanismTag: 'Mecanismo Molecular',
        content: `A parede celular bacteriana confere integridade estrutural e resistência à lise osmótica.

1. **Betalactâmicos (Penicilinas, Cefalosporinas, Carbapenêmicos, Monobactâmicos)**:
   - **Mecanismo**: Ligam-se covalentemente às **PBPs (*Penicillin-Binding Proteins*)**, que são transpeptidases essenciais que catalisam as ligações cruzadas da camada de peptideoglicano.
   - A inibição da transpeptidação desestabiliza a parede e ativa autolisinas endógenas bacterianas, promovendo ação **bactericida tempo-dependente** (meta: % do tempo em que a concentração livre fica acima da MIC - %T > MIC).
   - **Resistência**: Produção de betalactamases (ex: ESBL, KPC, metalo-betalactamases) e mutação na PBP (ex: PBP2a no *Staphylococcus aureus* resistente à meticilina - MRSA, mediado pelo gene *mecA*).

2. **Glicopeptídeos (Vancomicina, Teicoplanina)**:
   - **Mecanismo**: Ligam-se diretamente ao terminal **D-Alanil-D-Alanina** dos precursores de peptideoglicano, impedindo estericamente o acesso das transpeptidases.
   - Não penetram na membrana externa de Gram-negativos (portanto, ativos apenas contra Gram-positivos).`,
        keyTakeaways: [
          'MRSA é resistente a todos os betalactâmicos tradicionais porque a PBP2a modificada tem afinidade quase nula por eles (com exceção da Ceftarolina, cefalosporina de 5ª geração).',
          'Betalactâmicos são antibióticos tempo-dependentes (infusão estendida ou contínua maximiza eficácia).',
        ],
        clinicalPearl: 'A Ceftriaxona é excretada 40% pela via biliar e 60% renal, não necessitando de ajuste de dose na insuficiência renal isolada (diferente da Cefepima e Meropenem).',
      },
      {
        id: 'sec-atb-ribossomo',
        title: '2. Inibidores da Síntese Proteica (Subunidades 30S e 50S)',
        mechanismTag: 'Farmacodinâmica',
        content: `1. **Inibidores da Subunidade 30S**:
   - **Aminoglicosídeos (Amicacina, Gentamicina)**: Ligam-se irreversivelmente ao 30S, induzindo leitura errônea do RNAm e bloqueio de translocação. São **bactericidas concentração-dependentes** com prolongado Efeito Pós-Antibiótico (EPA). Exigem transporte ativo dependente de oxigênio (inativos contra anaeróbios estritos).
   - **Tetraciclinas / Glicilciclinas (Doxiciclina, Tigeciclina)**: Bloqueiam o sítio A do ribossomo 30S, impedindo a ligação do aminoacil-RNAt. Bacteriostáticos.

2. **Inibidores da Subunidade 50S**:
   - **Macrolídeos (Azitromicina, Claritromicina)** e **Lincosamidas (Clindamicina)**: Bloqueiam a transpeptidação e o canal de saída do polipeptídeo nascente no 50S. A metilação ribossômica pelo gene *erm* confere resistência cruzada (fenótipo MLSb).
   - **Oxazolidinonas (Linezolida)**: Inibe a formação do próprio complexo de iniciação 70S. Excelente para MRSA e VRE (Enterococo resistente à vancomicina).`,
        keyTakeaways: [
          'Macrolídeos e Quinolonas prolongam o intervalo QTc no eletrocardiograma (risco de Torsades de Pointes se associados).',
          'Aminoglicosídeos causam nefrotoxicidade por acúmulo tubular proximal e ototoxicidade cocleovestibular irreversível.',
        ],
      },
    ],
  },
  {
    id: 'comp-gastro-cirrose',
    disciplineId: 'gastro',
    themeId: 'gastro-cirrose',
    title: 'Cirrose Hepática: Hipertensão Portal, PBE e Encefalopatia',
    subtitle: 'Fisiopatologia vascular sinusoidal, gradiente de pressão venosa hepática e manejo de complicações agudas',
    estimatedReadTimeMinutes: 13,
    lastUpdated: '2026-08-12',
    author: 'Conteúdo de demonstração (fictício)',
    references: [
      'Diretrizes da Sociedade Brasileira de Hepatologia (SBH) sobre Hipertensão Portal e Cirrose (2023)',
      'AASLD Practice Guidance: Diagnosis and Management of Ascites and Hepatorenal Syndrome (2024)',
    ],
    sections: [
      {
        id: 'sec-cirrose-hp',
        title: '1. Fisiopatologia da Hipertensão Portal & Formação da Ascite',
        mechanismTag: 'Fisiopatologia Vascular',
        content: `A cirrose hepática representa o estágio final comum de injúria hepática crônica crônica, caracterizada por destruição do parênquima, fibrose difusa e regeneração nodular.

1. **Hipertensão Portal (Gradiente de Pressão Venosa Hepática - GPVH ≥ 6 mmHg)**:
   - **Resistência intra-hepática aumentada**: Componente estrutural (fibrose e nódulos) + componente dinâmico (deficiência endotelial de óxido nítrico e excesso de endotelina-1 contraindo os sinusoides).
   - **Vasodilatação esplâncnica reflexa**: Excesso de óxido nítrico e substâncias vasodilatadoras na circulação esplâncnica aumenta o fluxo aferente na veia porta, perpetuando a hipertensão.

2. **Mecanismo da Ascite e Síndrome Hepatorrenal**:
   - A intensa vasodilatação esplâncnica reduz o volume arterial circulante efetivo (hipovolemia relativa central).
   - Ocorre ativação maciça do SRAA, SNS e secreção não-osmótica de ADH (vasopressina), promovendo intensa retenção renal de água e sódio.
   - O extravasamento capilar peritoneal supera a drenagem linfática, acumulando líquido ascite com **GASA (Gradiente de Albumina Soro-Ascite) ≥ 1,1 g/dL** (indicativo de hipertensão portal).`,
        keyTakeaways: [
          'GASA ≥ 1,1 g/dL confirma hipertensão portal (Cirrose, Insuficiência Cardíaca, Síndrome de Budd-Chiari).',
          'GASA < 1,1 g/dL indica causa peritoneal (Carcinomatose peritoneal, Tuberculose peritoneal, Síndrome nefrótica, Pancreatite).',
        ],
        clinicalPearl: 'O tratamento inicial da ascite consiste em restrição de sódio (2 g/dia) associada a Espironolactona (100 mg/dia) + Furosemida (40 mg/dia) mantendo a proporção 100:40 para equilíbrio do potássio.',
      },
      {
        id: 'sec-cirrose-pbe',
        title: '2. Peritonite Bacteriana Espontânea (PBE) vs Secundária',
        mechanismTag: 'Diagnóstico & Terapêutica',
        content: `A PBE ocorre pela translocação bacteriana da luz intestinal para linfonodos mesentéricos e corrente sanguínea com colonização de um líquido ascítico pobre em opsoninas e complemento:

- **Diagnóstico Laboratorial da PBE**: Paracentese diagnóstica demonstrando **Contagem de Polimorfonucleares (PMN / Neutrófilos) ≥ 250 células/mm³** no líquido ascítico, na ausência de foco cirúrgico intra-abdominal.
- **Microbiologia**: Tipicamente monomicrobiana por enterobactérias Gram-negativas (*Escherichia coli*, *Klebsiella pneumoniae*) ou pneumococo.
- **Tratamento de Escolha**: **Cefotaxima 2 g EV 8/8h** ou **Ceftriaxona 2 g EV 1x/dia** por 5 dias.
- **Prevenção da Síndrome Hepatorrenal**: **Albumina humana 20%** administrada na dose de **1,5 g/kg no D1** e **1,0 g/kg no D3**. Esta conduta reduz a incidência de falência renal de 30% para 10% e diminui a mortalidade de 29% para 10%!`,
        keyTakeaways: [
          'Se a cultura for polimicrobiana (Gram-negativos + Gram-positivos + Anaeróbios) ou o líquido tiver glicose < 50 mg/dL, proteína total > 1 g/dL e LDH elevado (Critérios de Runyon), suspeitar de Peritonite Secundária (perfuração visceral) e solicitar TC de abdome com urgência.',
          'Profilaxia secundária de PBE é obrigatória com Norfloxacino 400 mg/dia ou Ciprofloxacino 500 mg/dia indefinidamente até transplante hepático.',
        ],
        warningAlert: 'Nunca esquecer de prescrever Albumina no D1 e D3 no tratamento da PBE quando creatinina > 1 mg/dL, ureia > 30 mg/dL ou bilirrubina > 4 mg/dL.',
      },
    ],
  },
];

export const INITIAL_QUESTIONS: Question[] = [
  {
    id: 'q-cardio-01',
    disciplineId: 'cardio',
    themeId: 'cardio-ic',
    compendiumRefId: 'comp-cardio-ic',
    compendiumSectionId: 'sec-ic-terapia',
    cycle: 'clinico',
    difficulty: 'medio',
    institution: 'USP - Residência Médica',
    year: 2025,
    clinicalVignette: `Um homem de 62 anos, com histórico de infarto agudo do miocárdio prévio há 2 anos, comparece à consulta ambulatorial de cardiologia. Queixa-se de cansaço progressivo aos esforços moderados (subir um lance de escadas) e ortopneia ocasional (classe funcional NYHA II). Ao exame físico: PA 128/78 mmHg, FC 68 bpm regular, estase jugular a 45 graus visível, murmúrio vesicular presente sem estertores, presença de terceira bulha (B3) no ictus cordis e discreto edema maleolar bilateral (+/4+). O ecocardiograma transtorácico recente revela ventrículo esquerdo dilatado com Fração de Ejeção do VE (FEVE) de 32% e hipocinesia anterior difusa. Atualmente, ele está em uso de Enalapril 20 mg 2x/dia e Carvedilol 25 mg 2x/dia.`,
    questionStem: `Considerando as mais recentes diretrizes clínicas de Insuficiência Cardíaca para otimização terapêutica e redução de mortalidade neste paciente, qual conduta deve ser adotada?`,
    options: [
      {
        letter: 'A',
        text: 'Associar Digoxina 0,25 mg/dia para aumentar a força de contração miocárdica e suspender o Enalapril.',
        isCorrect: false,
        explanation: 'Incorreta. A Digoxina melhora sintomas e reduz hospitalizações na ICFEr refratária, mas comprovadamente NÃO reduz mortalidade cardiovascular (estudo DIG). Além disso, suspender o inibidor do SRAA pioraria o prognóstico.',
        mechanismReference: 'A Digoxina inibe a bomba Na+/K+ ATPase aumentando o cálcio intracelular, porém sem benefício sobre o remodelamento patológico crônico.',
      },
      {
        letter: 'B',
        text: 'Manter Enalapril e Carvedilol, e adicionar Espironolactona 25 mg/dia e Dapagliflozina 10 mg/dia.',
        isCorrect: true,
        explanation: 'Correta! O paciente possui ICFEr sintomática (NYHA II, FE 32%) e já usa 2 dos 4 pilares (iECA + BB). Para completar o "Quarteto Fantástico" com benefício comprovado de sobrevida, deve-se associar o antagonista mineralocorticoide (Espironolactona) e o inibidor de SGLT2 (Dapagliflozina ou Empagliflozina), mesmo que o paciente não seja diabético.',
        mechanismReference: 'A Espironolactona bloqueia a fibrose mediada pela aldosterona e a Dapagliflozina otimiza o metabolismo miocárdico e reduz pré/pós-carga.',
      },
      {
        letter: 'C',
        text: 'Substituir imediatamente o Carvedilol por Tartarato de Metoprolol e prescrever Furosemida 40 mg 3x/dia como monoterapia.',
        isCorrect: false,
        explanation: 'Incorreta. O Tartarato de Metoprolol NÃO demonstrou redução de mortalidade em ensaios clínicos (apenas o Succinato de Metoprolol, Carvedilol e Bisoprolol são aprovados na ICFEr). Diuréticos de alça isolados também não reduzem mortalidade.',
        mechanismReference: 'Apenas os 3 betabloqueadores validados revertem o remodelamento simpático adverso.',
      },
      {
        letter: 'D',
        text: 'Trocar o Enalapril por Sacubitril/Valsartana sem período de espera e associar Hidralazina com Mononitrato de Isossorbida.',
        isCorrect: false,
        explanation: 'Incorreta por dois motivos: (1) A troca de iECA para Sacubitril/Valsartana EXIGE um intervalo livre (washout) de no mínimo 36 horas para prevenir angioedema com risco de asfixia; (2) Hidralazina + Nitrato é reservada para intolerantes a IECA/BRA ou afrodescendentes em NYHA III-IV já otimizados.',
        mechanismReference: 'A inibição concomitante da ECA e da Neprilisina acumula excesso de bradicinina na mucosa orofaríngea causando angioedema fatal.',
      },
    ],
    generalCommentary: `Excelente questão clássica sobre os pilares modificadores de sobrevida na ICFEr (FE ≤ 40%). O quarteto fundamental inclui: 1) ARNI (ou iECA/BRA); 2) Betabloqueador (Carvedilol, Succinato de Metoprolol ou Bisoprolol); 3) ARM (Espironolactona); e 4) iSGLT2 (Dapagliflozina ou Empagliflozina).`,
    highYieldSummary: 'Todo paciente com ICFEr sintomático deve receber as 4 drogas modificadoras de sobrevida (ARNI/iECA + BB + ARM + iSGLT2), respeitando a função renal e o potássio sérico.',
    tags: ['Cardiologia', 'Insuficiência Cardíaca', 'Farmacologia Cardiovascular', 'SBC 2024'],
    flashcardTemplate: {
      front: 'Quais são as 4 classes farmacológicas que compõem o "Quarteto Fantástico" com benefício comprovado de redução de mortalidade na ICFEr?',
      back: '1. ARNI (Sacubitril/Valsartana) ou iECA/BRA;\n2. Betabloqueador (Carvedilol, Succinato de Metoprolol ou Bisoprolol);\n3. Antagonista Mineralocorticoide (Espironolactona);\n4. Inibidor de SGLT2 (Dapagliflozina ou Empagliflozina).',
      mechanismNote: 'Bloqueio neuro-humoral quádruplo que reverte o remodelamento ventricular e fibrose intersticial.',
    },
  },
  {
    id: 'q-pneumo-01',
    disciplineId: 'pneumo',
    themeId: 'pneumo-asma',
    compendiumRefId: 'comp-pneumo-asma',
    compendiumSectionId: 'sec-asma-gina',
    cycle: 'clinico',
    difficulty: 'facil',
    institution: 'ENARE / Exame Nacional',
    year: 2024,
    clinicalVignette: `Uma paciente de 24 anos, estudante universitária, relata episódios intermitentes de chiado no peito e tosse seca noturna que ocorrem cerca de 2 vezes por semana, especialmente após correr ou nos dias frios. Nega despertares noturnos frequentes e nega crises prévias com necessidade de internação. A espirometria confirma diagnóstico de asma com variação significativa de VEF1 pós-broncodilatador.`,
    questionStem: `De acordo com as recomendações da Global Initiative for Asthma (GINA 2024) para o Track 1 preferencial de manejo da asma, qual é o tratamento inicial mais adequado?`,
    options: [
      {
        letter: 'A',
        text: 'Prescrever Salbutamol spray (SABA) isolado para ser usado exclusivamente nas crises de falta de ar.',
        isCorrect: false,
        explanation: 'Incorreta. O uso de SABA em monoterapia foi formalmente contraindicado pelo GINA, pois aumenta a hiper-responsividade brônquica e eleva o risco de exacerbações graves e óbito por asma.',
        mechanismReference: 'O beta-2 agonista puro isolado causa dessensibilização dos receptores e não combate o infiltrado inflamatório subjacente de eosinófilos.',
      },
      {
        letter: 'B',
        text: 'Prescrever Corticoide Inalatório em dose baixa associado a Formoterol (CI + Formoterol) para uso conforme a necessidade (resgate).',
        isCorrect: true,
        explanation: 'Correta! No Track 1 preferencial do GINA (Etapas 1 e 2), a medicação de escolha para asma leve/intermitente é a combinação de CI (ex: Budesonida ou Beclometasona) com Formoterol em dose baixa usada em regime de resgate ("conforme a necessidade"). Isso garante que todo alívio de broncoespasmo seja acompanhado de controle anti-inflamatório.',
        mechanismReference: 'O Formoterol tem início de ação ultra-rápido (1 a 3 minutos) com duração de 12 horas, enquanto o corticoide aborta a cascata de citocinas inflamatórias.',
      },
      {
        letter: 'C',
        text: 'Iniciar Corticoide Oral (Prednisona 40 mg/dia contínuo) associado a Teofilina de liberação prolongada.',
        isCorrect: false,
        explanation: 'Incorreta. Corticoide oral contínuo traz toxicidade sistêmica grave (osteoporose, síndrome de Cushing, imunossupressão) e só é cogitado na asma grave refratária Etapa 5.',
        mechanismReference: 'A Teofilina possui estreita faixa terapêutica e alto risco de arritmias cardíacas.',
      },
      {
        letter: 'D',
        text: 'Prescrever Salmeterol spray isolado 2x ao dia sem corticoide.',
        isCorrect: false,
        explanation: 'Incorreta e perigosa. LABA em monoterapia sem corticoide é proibido na asma brônquica (Black Box Warning) por aumentar o risco de crise asmática fatal.',
        mechanismReference: 'O Salmeterol tem início de ação lento (15-30 min) e não serve para alívio imediato.',
      },
    ],
    generalCommentary: `Questão fundamental de atualização em pneumologia: o GINA aboliu o tratamento de asma apenas com broncodilatador de curta ação (SABA). A estratégia preferencial (Track 1) utiliza a combinação sinérgica de Corticoide Inalatório + Formoterol.`,
    highYieldSummary: 'Asma é doença inflamatória. Nunca tratar apenas com broncodilatador de alívio isolado. A combinação de escolha no GINA Track 1 é CI + Formoterol de resgate.',
    tags: ['Pneumologia', 'Asma', 'GINA 2024', 'Farmacologia Respiratória'],
    flashcardTemplate: {
      front: 'Por que o Formoterol é o único LABA que pode ser utilizado como medicação de alívio rápido nas crises de asma no GINA Track 1?',
      back: 'Porque o Formoterol possui início de ação ultra-rápido (1 a 3 minutos), similar ao salbutamol, associado à longa duração de ação (12h), permitindo broncodilatação imediata somada ao efeito anti-inflamatório do corticoide associado.',
      mechanismNote: 'Agonista beta-2 com rápida partição na membrana lipídica dos miócitos brônquicos.',
    },
  },
  {
    id: 'q-infecto-01',
    disciplineId: 'infecto',
    themeId: 'infecto-sepse',
    compendiumRefId: 'comp-infecto-sepse',
    compendiumSectionId: 'sec-sepse-hora-1',
    cycle: 'clinico',
    difficulty: 'dificil',
    institution: 'UNIFESP - Prova de Título / Residência',
    year: 2025,
    clinicalVignette: `Um homem de 68 anos dá entrada na Unidade de Terapia Intensiva com quadro de tosse produtiva purulenta e confusão mental há 24 horas. Sinais vitais: PA 76/42 mmHg (PAM 53 mmHg), FC 124 bpm, FR 30 irpm, SatO2 88% em ar ambiente, Temperatura 38,9°C. Exames laboratoriais iniciais: Leucócitos 24.500/mm³ (com 18% de bastões), Plaquetas 88.000/mm³, Creatinina 2,4 mg/dL, Bilirrubina total 2,8 mg/dL e Lactato arterial 4,8 mmol/L. Foi iniciada expansão volêmica imediata com cristaloide balanceado (Ringer Lactato 30 mL/kg). Após a infusão rápida de 2.000 mL, a pressão arterial permanece 80/44 mmHg (PAM 56 mmHg) e o lactato de controle em 2 horas é 4,2 mmol/L.`,
    questionStem: `Qual é a melhor conduta imediata para este paciente e a droga vasoativa de primeira linha preconizada pelas diretrizes do Surviving Sepsis Campaign?`,
    options: [
      {
        letter: 'A',
        text: 'Iniciar infusão contínua de Dopamina em dose alfa (10 mcg/kg/min) por cateter periférico calibroso e suspender o antibiótico.',
        isCorrect: false,
        explanation: 'Incorreta. A Dopamina está associada a maior incidência de arritmias ventriculares e supraventriculares e maior mortalidade em comparação à Noradrenalina no choque séptico.',
        mechanismReference: 'A Dopamina estimula receptores adrenérgicos e dopaminérgicos de forma menos seletiva, com alto cronotropismo negativo para o miocárdio isquêmico.',
      },
      {
        letter: 'B',
        text: 'Iniciar precocemente Noradrenalina titulada para alvo de PAM ≥ 65 mmHg, colher hemoculturas e garantir antibiótico de amplo espectro na primeira hora.',
        isCorrect: true,
        explanation: 'Correta! O paciente preenche critérios para Choque Séptico (sepse + hipotensão refratária a volume com necessidade de vasopressor para manter PAM ≥ 65 mmHg + lactato > 2 mmol/L). A droga vasopressora de primeira escolha inquestionável é a Noradrenalina.',
        mechanismReference: 'A Noradrenalina atua predominantemente em receptores alfa-1 adrenérgicos promovendo vasoconstrição venosa e arteriolar, restabelecendo o tônus vascular sem taquicardia excessiva.',
      },
      {
        letter: 'C',
        text: 'Administrar imediatamente 500 mL de albumina 20% e prescrever Epinefrina em bólus a cada 5 minutos.',
        isCorrect: false,
        explanation: 'Incorreta. Epinefrina em bólus repetidos causa taquiarritmias graves e hiperlactatemia iatrogênica por estimulação beta-2. A noradrenalina em infusão contínua é a droga de escolha.',
        mechanismReference: 'A Epinefrina acelera a glicólise aeróbia via receptor beta-2 muscular, gerando elevação artificial do lactato.',
      },
      {
        letter: 'D',
        text: 'Realizar punção lombar antes de qualquer medicação e prescrever apenas corticoide oral.',
        isCorrect: false,
        explanation: 'Incorreta. O quadro é nitidamente pulmonar (tosse produtiva) e o atraso antimicrobiano para procedimentos invasivos desnecessários aumenta drasticamente a mortalidade.',
        mechanismReference: 'Cada hora de atraso na antibioticoterapia adequada na sepse grave aumenta a mortalidade em até 8%.',
      },
    ],
    generalCommentary: `O Choque Séptico é definido pela presença de sepse + necessidade de vasopressor para manter PAM ≥ 65 mmHg + lactato > 2 mmol/L apesar de reposição volêmica adequada. O vasopressor de escolha é a Noradrenalina. Se a dose subir para > 0,25 mcg/kg/min, associa-se Vasopressina a 0,03 U/min.`,
    highYieldSummary: 'Choque Séptico = Hipotensão refratária a volume + Lactato > 2 mmol/L. Vasopressor de 1ª linha: Noradrenalina (alvo PAM ≥ 65 mmHg).',
    tags: ['Infectologia', 'Terapia Intensiva', 'Sepse', 'Choque Séptico', 'Surviving Sepsis'],
    flashcardTemplate: {
      front: 'Quais são os dois critérios obrigatórios para definir Choque Séptico segundo o consenso internacional Sepsis-3?',
      back: '1. Hipotensão persistente com necessidade de vasopressor (Noradrenalina) para manter PAM ≥ 65 mmHg mesmo após ressuscitação volêmica adequada;\n2. Lactato sérico > 2,0 mmol/L (> 18 mg/dL) persistente.',
      mechanismNote: 'Expressa falência microcirculatória e colapso metabólico tecidual com alta mortalidade (>40%).',
    },
  },
  {
    id: 'q-farmaco-01',
    disciplineId: 'farmaco',
    themeId: 'farmaco-atb',
    compendiumRefId: 'comp-farmaco-atb',
    compendiumSectionId: 'sec-atb-parede',
    cycle: 'basico',
    difficulty: 'medio',
    institution: 'USP - Faculdade de Medicina',
    year: 2024,
    clinicalVignette: `Durante a discussão de casos de infecções hospitalares na enfermaria cirúrgica, o preceptor questiona sobre os mecanismos moleculares de resistência bacteriana aos antibióticos betalactâmicos. Uma cepa de Staphylococcus aureus isolada em hemocultura foi identificada como MRSA (resistente à oxacilina/meticilina).`,
    questionStem: `Qual é a alteração molecular responsável pelo fenótipo de resistência aos betalactâmicos no MRSA?`,
    options: [
      {
        letter: 'A',
        text: 'Produção plasmidial massiva de enzimas betalactamases de espectro estendido (ESBL) que hidrolisam o anel betalactâmico.',
        isCorrect: false,
        explanation: 'Incorreta. ESBLs são típicas de bactérias Gram-negativas (como Klebsiella e E. coli) e não explicam a resistência intrínseca do MRSA à oxacilina.',
        mechanismReference: 'A oxacilina já é molecularmente desenhada para ser imune à hidrólise por penicilinases estafilocócicas comuns.',
      },
      {
        letter: 'B',
        text: 'Aquisição do gene mecA, que codifica a proteína ligadora de penicilina mutada PBP2a com baixíssima afinidade pelos betalactâmicos tradicionais.',
        isCorrect: true,
        explanation: 'Correta! O mecanismo fundamental do MRSA é a presença do cassete cromossômico SCCmec contendo o gene mecA, que expressa a transpeptidase PBP2a. Esta proteína realiza a síntese da parede celular bacteriana mesmo na presença de altas concentrações de oxacilina e de outros betalactâmicos clássicos.',
        mechanismReference: 'A alteração conformacional do sítio ativo da PBP2a impede a ligação covalente dos betalactâmicos usuais.',
      },
      {
        letter: 'C',
        text: 'Metilação da subunidade 50S do ribossomo bacteriano impedindo a ligação da oxacilina ao RNA ribossomal.',
        isCorrect: false,
        explanation: 'Incorreta. Betalactâmicos agem na parede celular (PBPs), e não no ribossomo. A metilação do 50S é o mecanismo de resistência a macrolídeos e clindamicina (gene erm).',
        mechanismReference: 'O gene erm confere o fenótipo MLSb de resistência ribossômica.',
      },
      {
        letter: 'D',
        text: 'Superexpressão de bombas de efluxo da família RND que expulsam a vancomicina e betalactâmicos do espaço periplasmático.',
        isCorrect: false,
        explanation: 'Incorreta. Estafilococos são Gram-positivos e não possuem espaço periplasmático gram-negativo. Bombas RND são características de Pseudomonas aeruginosa.',
        mechanismReference: 'Gram-positivos possuem parede espessa de peptideoglicano sem membrana externa.',
      },
    ],
    generalCommentary: `Mecanismo de altíssima cobrança em provas acadêmicas e de residência médica: MRSA decorre da PBP2a codificada pelo gene mecA. A única classe de betalactâmico com afinidade por PBP2a é a cefalosporina de 5ª geração (Ceftarolina). Para tratamento de infecções sistêmicas por MRSA, a primeira linha padrão é Vancomicina ou Daptomicina.`,
    highYieldSummary: 'MRSA = Gene mecA -> PBP2a modificada com baixa afinidade a todos os betalactâmicos convencionais. Tratar com Vancomicina, Daptomicina ou Ceftarolina.',
    tags: ['Farmacologia', 'Microbiologia', 'MRSA', 'Betalactâmicos', 'Resistência Bacteriana'],
    flashcardTemplate: {
      front: 'Qual é o mecanismo genético e molecular da resistência do Staphylococcus aureus à oxacilina/meticilina (MRSA)?',
      back: 'Aquisição do gene mecA (inserido no cassete SCCmec), que codifica uma transpeptidase modificada chamada PBP2a, a qual possui afinidade quase nula por betalactâmicos convencionais.',
      mechanismNote: 'A PBP2a continua sintetizando a parede celular mesmo com altas concentrações de oxacilina.',
    },
  },
  {
    id: 'q-gastro-01',
    disciplineId: 'gastro',
    themeId: 'gastro-cirrose',
    compendiumRefId: 'comp-gastro-cirrose',
    compendiumSectionId: 'sec-cirrose-pbe',
    cycle: 'clinico',
    difficulty: 'medio',
    institution: 'UFRJ - Residência Médica',
    year: 2024,
    clinicalVignette: `Um paciente de 54 anos com cirrose hepática de etiologia alcoólica (Child-Pugh B, MELD 18) é internado com queixa de aumento do volume abdominal, dor abdominal difusa leve e febre baixa (37,9°C) há 2 dias. Ao exame: ictérico 2+/4+, abdome globoso com ascite volumosa e dor leve à descompressão. É realizada paracentese diagnóstica imediata. A análise do líquido ascítico revela: aspecto turvo, 650 leucócitos/mm³ com 78% de polimorfonucleares (PMN = 507/mm³), Proteína total 1,2 g/dL, Glicose 68 mg/dL e LDH 140 U/L. A dosagem de albumina sérica é 2,6 g/dL e no líquido ascítico é 0,8 g/dL. Creatinina sérica 1,4 mg/dL.`,
    questionStem: `Qual é o diagnóstico mais provável e a conduta terapêutica completa recomendada?`,
    options: [
      {
        letter: 'A',
        text: 'Peritonite Bacteriana Espontânea (PBE); iniciar Cefotaxima ou Ceftriaxona endovenosa associada à infusão de Albumina humana 20% no D1 (1,5 g/kg) e D3 (1,0 g/kg).',
        isCorrect: true,
        explanation: 'Correta! O paciente apresenta PBE confirmada pelo critério de contagem de polimorfonucleares (PMN) no líquido ascítico ≥ 250 células/mm³ (neste caso, 507/mm³). A conduta padrão é cefalosporina de 3ª geração (Ceftriaxona ou Cefotaxima) + expansão com Albumina no D1 (1,5 g/kg) e D3 (1,0 g/kg) para prevenção de síndrome hepatorrenal e redução de mortalidade.',
        mechanismReference: 'A albumina melhora a volemia efetiva e neutraliza o choque vasodilatador induzido por citocinas na microcirculação renal.',
      },
      {
        letter: 'B',
        text: 'Peritonite Bacteriana Secundária por perfuração gástrica; indicar laparotomia exploradora de emergência imediatamente.',
        isCorrect: false,
        explanation: 'Incorreta. A peritonite secundária cursa com critérios de Runyon (glicose < 50, proteína > 1, LDH muito elevado) ou flora polimicrobiana exuberante. O quadro atual é clássico de PBE e laparotomia em cirrótico descompensado sem indicação tem mortalidade proibitiva.',
        mechanismReference: 'Glicose preservada (>50 mg/dL) favorece fortemente PBE.',
      },
      {
        letter: 'C',
        text: 'Ascite neutrocítica assintomática; apenas manter observação clínica e repetir paracentese em 7 dias sem antibiótico.',
        isCorrect: false,
        explanation: 'Incorreta e perigosa. PBE não tratada evolui rapidamente com sepse, choque e falência renal.',
        mechanismReference: 'A translocação bacteriana bacteriana ativa cascatas inflamatórias graves.',
      },
      {
        letter: 'D',
        text: 'Síndrome Nefrótica descompensada; prescrever corticoterapia em altas doses e restringir totalmente a ingestão hídrica.',
        isCorrect: false,
        explanation: 'Incorreta. O cálculo do GASA (Albumina soro - Albumina ascite = 2,6 - 0,8 = 1,8 g/dL). Como GASA ≥ 1,1 g/dL, confirma-se hipertensão portal cirrótica.',
        mechanismReference: 'GASA ≥ 1,1 g/dL traduz hipertensão portal clássica.',
      },
    ],
    generalCommentary: `Excelente questão que avalia o tripé da PBE: 1) Diagnóstico com PMN ≥ 250/mm³; 2) Diferenciação de peritonite secundária pelos critérios de Runyon; 3) Associação obrigatória de Albumina 1,5 g/kg D1 e 1,0 g/kg D3 para proteger a função renal.`,
    highYieldSummary: 'PBE = Neutrófilos/PMN ≥ 250/mm³ na ascite. Tratamento: Ceftriaxona/Cefotaxima + Albumina humana (1,5g/kg D1 e 1,0g/kg D3).',
    tags: ['Gastroenterologia', 'Hepatologia', 'Cirrose Hepática', 'PBE', 'Hipertensão Portal'],
    flashcardTemplate: {
      front: 'Qual é o critério laboratorial para diagnóstico de Peritonite Bacteriana Espontânea (PBE) na paracentese e qual fármaco reduz mortalidade por síndrome hepatorrenal?',
      back: 'Critério: Contagem de Polimorfonucleares (PMN/Neutrófilos) ≥ 250 células/mm³ no líquido ascítico.\nProteção renal: Albumina humana 20% (1,5 g/kg no D1 e 1,0 g/kg no D3).',
      mechanismNote: 'A albumina repõe o volume arterial efetivo e preserva a perfusão glomerular renal.',
    },
  },
];

export const INITIAL_FLASHCARDS: Flashcard[] = [
  {
    id: 'fc-01',
    disciplineId: 'cardio',
    themeId: 'cardio-ic',
    compendiumRefId: 'comp-cardio-ic',
    front: 'Quais são as 4 classes farmacológicas que reduzem mortalidade na ICFEr (o "Quarteto Fantástico")?',
    back: '1. ARNI (Sacubitril/Valsartana) ou iECA/BRA\n2. Betabloqueador (Carvedilol, Succinato de Metoprolol, Bisoprolol)\n3. Antagonista Mineralocorticoide (Espironolactona)\n4. Inibidor de SGLT2 (Dapagliflozina, Empagliflozina)',
    mechanismHighlight: 'Bloqueio neuro-humoral quádruplo contra a hiperativação deletéria do SRAA, SNS e sobrecarga metabólica.',
    tags: ['Cardiologia', 'ICFEr', 'Farmacologia'],
    difficulty: 'medio',
    srs: {
      intervalDays: 1,
      repetitionCount: 1,
      easeFactor: 2.5,
      nextDueDate: new Date().toISOString(),
      state: 'new',
      reviewHistory: [],
    },
  },
  {
    id: 'fc-02',
    disciplineId: 'cardio',
    themeId: 'cardio-ic',
    compendiumRefId: 'comp-cardio-ic',
    front: 'Qual é o intervalo obrigatório de washout ao fazer a transição de um iECA (ex: Enalapril) para Sacubitril/Valsartana e por quê?',
    back: 'Mínimo de 36 horas de intervalo livre.\nMotivo: Evitar o risco grave de ANGIOEDEMA com obstrução de via aérea decorrente do acúmulo concomitante de bradicinina.',
    mechanismHighlight: 'Tanto a ECA quanto a Neprilisina degradam a bradicinina; a inibição simultânea gera pico de bradicinina.',
    tags: ['Cardiologia', 'Segurança Medicamentosa', 'Farmacologia'],
    difficulty: 'dificil',
    srs: {
      intervalDays: 1,
      repetitionCount: 1,
      easeFactor: 2.5,
      nextDueDate: new Date().toISOString(),
      state: 'new',
      reviewHistory: [],
    },
  },
  {
    id: 'fc-03',
    disciplineId: 'pneumo',
    themeId: 'pneumo-asma',
    compendiumRefId: 'comp-pneumo-asma',
    front: 'Segundo o GINA 2024 (Track 1 preferencial), qual é o esquema de alívio/resgate preconizado para asma leve a moderada?',
    back: 'Corticoide Inalatório (CI) em dose baixa + Formoterol utilizado conforme a necessidade (em resgate).',
    mechanismHighlight: 'O Formoterol tem início de ação em 1-3 minutos, e a combinação garante que todo resgate administre corticoide anti-inflamatório.',
    tags: ['Pneumologia', 'Asma', 'GINA 2024'],
    difficulty: 'facil',
    srs: {
      intervalDays: 1,
      repetitionCount: 1,
      easeFactor: 2.5,
      nextDueDate: new Date().toISOString(),
      state: 'new',
      reviewHistory: [],
    },
  },
  {
    id: 'fc-04',
    disciplineId: 'infecto',
    themeId: 'infecto-sepse',
    compendiumRefId: 'comp-infecto-sepse',
    front: 'Quais são os critérios operacionais para diagnóstico de Choque Séptico segundo o consenso Sepsis-3?',
    back: 'Sepse associada a:\n1. Necessidade de Vasopressor (Noradrenalina) para manter PAM ≥ 65 mmHg após reposição volêmica adequada;\n2. Lactato sérico > 2,0 mmol/L (> 18 mg/dL).',
    mechanismHighlight: 'Traduz disfunção metabólica e vasodilatação periférica grave refratária a fluidos.',
    tags: ['Infectologia', 'UTI', 'Sepse'],
    difficulty: 'medio',
    srs: {
      intervalDays: 1,
      repetitionCount: 1,
      easeFactor: 2.5,
      nextDueDate: new Date().toISOString(),
      state: 'new',
      reviewHistory: [],
    },
  },
  {
    id: 'fc-05',
    disciplineId: 'farmaco',
    themeId: 'farmaco-atb',
    compendiumRefId: 'comp-farmaco-atb',
    front: 'Qual o mecanismo genético e proteico de resistência aos betalactâmicos no MRSA (Staphylococcus aureus)?',
    back: 'Aquisição do gene mecA que codifica a transpeptidase PBP2a, com afinidade extremamente baixa por betalactâmicos convencionais.',
    mechanismHighlight: 'A PBP2a substitui as PBPs usuais na polimerização da parede de peptideoglicano.',
    tags: ['Farmacologia', 'Microbiologia', 'MRSA'],
    difficulty: 'medio',
    srs: {
      intervalDays: 1,
      repetitionCount: 1,
      easeFactor: 2.5,
      nextDueDate: new Date().toISOString(),
      state: 'new',
      reviewHistory: [],
    },
  },
  {
    id: 'fc-06',
    disciplineId: 'gastro',
    themeId: 'gastro-cirrose',
    compendiumRefId: 'comp-gastro-cirrose',
    front: 'Qual valor de contagem de polimorfonucleares (PMN) no líquido ascítico define Peritonite Bacteriana Espontânea (PBE)? E qual a dose de albumina preventiva?',
    back: 'PMN (neutrófilos) ≥ 250 células/mm³.\nAlbumina humana 20%: 1,5 g/kg no D1 e 1,0 g/kg no D3 para prevenir Síndrome Hepatorrenal.',
    mechanismHighlight: 'Expansão volêmica central que impede o colapso hemodinâmico renal mediado por citocinas.',
    tags: ['Gastroenterologia', 'Hepatologia', 'Cirrose'],
    difficulty: 'facil',
    srs: {
      intervalDays: 1,
      repetitionCount: 1,
      easeFactor: 2.5,
      nextDueDate: new Date().toISOString(),
      state: 'new',
      reviewHistory: [],
    },
  },
];
