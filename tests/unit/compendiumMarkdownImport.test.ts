import { describe, it, expect } from 'vitest';
import { parseCompendiumMarkdownText } from '../../src/utils/compendiumMarkdownImport';
import type { Discipline, Theme } from '../../src/types';

// Segunda porta de entrada de conteúdo (Markdown, produzido por IAs de
// fontes como NotebookLM) além do `.compendium.yaml` — ver
// docs/editorial/PADRAO-NEXUSMED-CONTEUDOS.md para a convenção esperada.
// A validação de campos obrigatórios é a mesma do YAML (buildCompendiumImportResult);
// aqui só provamos que a extração específica de Markdown está correta.

const discipline: Discipline = {
  id: 'disc-pneumo',
  name: 'Pneumologia',
  code: 'PNEUMO',
  icon: 'lungs',
  description: '',
  cycle: 'clinico',
  color: '#000',
};

const theme: Theme = {
  id: 'tema-espirometria',
  disciplineId: 'disc-pneumo',
  name: 'Espirometria',
  description: '',
  highYield: false,
  order: 1,
};

const validMarkdown = `# Espirometria: Padronizações Técnicas

**Subtítulo:** Guia prático de execução e interpretação
**Disciplina:** Pneumologia
**Tema:** Espirometria
**Autor:** Especialista em Pneumologia
**Tempo estimado de leitura:** 18 minutos

---

### Seção 1 — Fundamentos Fisiológicos
**Tag de Mecanismo:** Fisiopatologia

A espirometria mensura o volume de ar exalado [1](#ref-1). Isso é central
para o diagnóstico.

**Pontos-Chave:**
*   Primeira frase-síntese
*   Segunda frase-síntese

> 💡 **Pérola Clínica:** Preste atenção à curva fluxo-volume.
> ⚠️ **Alerta de Armadilha:** Não confunda VEF1 com CVF.

---

### Seção 2 — Preparação do Paciente

Suspenda broncodilatadores antes do exame [268].

### Tags
\`espirometria\` \`função pulmonar\`

### Referências Bibliográficas
1. Graham BL, et al. Standardization of Spirometry 2019 Update. [Consenso técnico internacional]
`;

describe('parseCompendiumMarkdownText', () => {
  it('interpreta um Markdown válido no padrão NexusMed', () => {
    const result = parseCompendiumMarkdownText(validMarkdown, [discipline], [theme], []);
    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error('esperado sucesso');

    expect(result.preview.title).toBe('Espirometria: Padronizações Técnicas');
    expect(result.preview.subtitle).toBe('Guia prático de execução e interpretação');
    expect(result.preview.disciplineId).toBe('disc-pneumo');
    expect(result.preview.themeId).toBe('tema-espirometria');
    expect(result.preview.author).toBe('Especialista em Pneumologia');
    expect(result.preview.estimatedReadTimeMinutes).toBe(18);
    expect(result.preview.sectionsCount).toBe(2);
    expect(result.preview.referencesCount).toBe(1);
    expect(result.tags).toEqual(['espirometria', 'função pulmonar']);

    const [sec1, sec2] = result.sections;
    expect(sec1.title).toBe('Fundamentos Fisiológicos');
    expect(sec1.mechanismTag).toBe('Fisiopatologia');
    expect(sec1.keyTakeaways).toEqual(['Primeira frase-síntese', 'Segunda frase-síntese']);
    expect(sec1.clinicalPearl).toBe('Preste atenção à curva fluxo-volume.');
    expect(sec1.warningAlert).toBe('Não confunda VEF1 com CVF.');
    // Blocos extraídos (Tag de Mecanismo, Pontos-Chave, blockquotes) não duplicam no corpo.
    expect(sec1.content).not.toMatch(/Tag de Mecanismo/);
    expect(sec1.content).not.toMatch(/Pontos-Chave/);
    expect(sec1.content).not.toMatch(/Pérola Clínica/);
    expect(sec1.content).toMatch(/mensura o volume de ar exalado/);

    expect(sec2.title).toBe('Preparação do Paciente');

    // Citação sem link (numeração interna de outra ferramenta) é sinalizada, não corrigida sozinha.
    expect(result.preview.missingFields.some((f) => /formato antigo/i.test(f))).toBe(true);
  });

  it('rejeita Markdown sem título', () => {
    const result = parseCompendiumMarkdownText('Sem heading H1 aqui.', [discipline], [theme], []);
    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error('esperado falha');
    expect(result.errors.some((e) => /título/i.test(e))).toBe(true);
  });

  it('não sinaliza citação legada quando o link já está correto', () => {
    const md = validMarkdown.replace('Suspenda broncodilatadores antes do exame [268].', 'Suspenda broncodilatadores antes do exame [1](#ref-1).');
    const result = parseCompendiumMarkdownText(md, [discipline], [theme], []);
    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error('esperado sucesso');
    expect(result.preview.missingFields.some((f) => /formato antigo/i.test(f))).toBe(false);
  });
});
