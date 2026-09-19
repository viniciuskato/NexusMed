import { describe, it, expect } from 'vitest';
import { parseCompendiumYamlText, findDuplicateCompendium } from '../../src/utils/compendiumImport';
import type { Compendium, Discipline, Theme } from '../../src/types';

// Missão 42-A — Entrada assistida de materiais.
//
// Prova a lógica pura de parse/validação/resolução do formato de autoria
// `.compendium.yaml` sem precisar de DOM nem Supabase — o componente
// (ImportMaterialModal) só orquestra I/O em cima disto.

const discipline: Discipline = {
  id: 'disc-infecto',
  name: 'Infectologia',
  code: 'INFECTO',
  icon: 'bug',
  description: '',
  cycle: 'clinico',
  color: '#000',
};

const theme: Theme = {
  id: 'tema-clinica',
  disciplineId: 'disc-infecto',
  name: 'Clínica',
  description: '',
  highYield: false,
  order: 1,
};

const validYaml = `
id: meningite-bacteriana-aguda
title: "Meningite Bacteriana Aguda"
subtitle: "Da fisiopatologia ao manejo"
disciplineName: Infectologia
themeName: Clínica
author: "Equipe Editorial"
estimatedReadTimeMinutes: 22
tags:
  - meningite
  - infecção
sections:
  - id: definicao
    title: Definição
    content: |
      Texto da seção.
    keyTakeaways:
      - Ponto 1
  - id: tratamento
    title: Tratamento
    content: |
      Outro texto.
    keyTakeaways:
      - Ponto 2
references:
  - "Referência 1"
  - "Referência 2"
`;

describe('parseCompendiumYamlText', () => {
  it('interpreta um arquivo válido e resolve disciplina/tema pelo nome', () => {
    const result = parseCompendiumYamlText(validYaml, [discipline], [theme], []);
    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error('esperado sucesso');
    expect(result.preview.title).toBe('Meningite Bacteriana Aguda');
    expect(result.preview.disciplineId).toBe('disc-infecto');
    expect(result.preview.themeId).toBe('tema-clinica');
    expect(result.preview.sectionsCount).toBe(2);
    expect(result.preview.referencesCount).toBe(2);
    expect(result.preview.missingFields).toEqual([]);
    expect(result.preview.isDuplicate).toBe(false);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].id).not.toBe('definicao'); // id do YAML é slug legível, descartado por um UUID real
  });

  it('rejeita YAML malformado com mensagem em linguagem simples', () => {
    const result = parseCompendiumYamlText('title: ["não fecha', [discipline], [theme], []);
    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error('esperado falha');
    expect(result.errors[0]).not.toMatch(/YAMLParseError|yaml\.js|at line/i);
    expect(result.technicalDetail).toBeTruthy();
  });

  it('rejeita arquivo sem título, sem disciplina/tema ou sem seções', () => {
    const result = parseCompendiumYamlText('subtitle: "Só isso"', [discipline], [theme], []);
    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error('esperado falha');
    expect(result.errors.some((e) => /título/i.test(e))).toBe(true);
    expect(result.errors.some((e) => /disciplina/i.test(e))).toBe(true);
    expect(result.errors.some((e) => /tema/i.test(e))).toBe(true);
    expect(result.errors.some((e) => /seção/i.test(e))).toBe(true);
  });

  it('marca disciplina/tema não encontrados como campo ausente, sem travar o parse', () => {
    const result = parseCompendiumYamlText(validYaml, [], [], []);
    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error('esperado sucesso');
    expect(result.preview.disciplineId).toBeNull();
    expect(result.preview.themeId).toBeNull();
    expect(result.preview.missingFields.some((f) => f.includes('Infectologia'))).toBe(true);
    expect(result.preview.missingFields.some((f) => f.includes('Clínica'))).toBe(true);
  });

  it('detecta material duplicado por título normalizado (acento/maiúsculas)', () => {
    const existing: Compendium = {
      id: 'existing-id',
      disciplineId: 'disc-infecto',
      themeId: 'tema-clinica',
      title: 'meningite bacteriana AGUDA',
      subtitle: '',
      estimatedReadTimeMinutes: 10,
      lastUpdated: '',
      author: '',
      sections: [],
      references: [],
    };
    const result = parseCompendiumYamlText(validYaml, [discipline], [theme], [existing]);
    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error('esperado sucesso');
    expect(result.preview.isDuplicate).toBe(true);
    expect(result.preview.duplicateOfId).toBe('existing-id');
  });

  it('não sinaliza duplicidade para títulos genuinamente diferentes', () => {
    expect(findDuplicateCompendium('Meningite Viral', [])).toBeUndefined();
  });
});
