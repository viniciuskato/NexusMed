import { describe, it, expect } from 'vitest';
import { mudancasDaSecao, valoresIniciais, type CamposDaSecao } from '../../src/components/compendium/mudancasDaSecao';

// ED-2 — o que vai para a gravação ao salvar uma seção editada na leitura: só o que mudou (AGENTS.md, item 17).

const secao: CamposDaSecao = {
  title: 'Título',
  content: 'Texto.\n\n- a\n- b',
  keyTakeaways: ['um', 'dois'],
  clinicalPearl: 'Pérola.',
  warningAlert: 'Alerta.',
};

describe('mudancasDaSecao', () => {
  it('sem mexer em nada, nenhum campo (salvar sem mudança é no-op)', () => {
    expect(mudancasDaSecao(secao, valoresIniciais(secao))).toStrictEqual({});
  });

  it('seção sem Pérola e sem Alerta, sem mexer: nenhum campo', () => {
    const sem: CamposDaSecao = { title: 'T', content: '', keyTakeaways: [] };
    expect(mudancasDaSecao(sem, valoresIniciais(sem))).toStrictEqual({});
  });

  it('só o campo que mudou entra, com o valor novo', () => {
    const v = valoresIniciais(secao);
    expect(mudancasDaSecao(secao, { ...v, titulo: 'Outro' })).toStrictEqual({ title: 'Outro' });
    expect(mudancasDaSecao(secao, { ...v, conteudo: 'Novo texto.' })).toStrictEqual({ content: 'Novo texto.' });
    expect(mudancasDaSecao(secao, { ...v, pontos: ['um', 'dois', 'três'] })).toStrictEqual({ keyTakeaways: ['um', 'dois', 'três'] });
    expect(mudancasDaSecao(secao, { ...v, perola: 'Nova pérola.' })).toStrictEqual({ clinicalPearl: 'Nova pérola.' });
    expect(mudancasDaSecao(secao, { ...v, alerta: 'Novo alerta.' })).toStrictEqual({ warningAlert: 'Novo alerta.' });
  });

  it('título, pontos, Pérola e Alerta valem aparados; espaço que já estava lá não é mudança', () => {
    const v = valoresIniciais(secao);
    expect(mudancasDaSecao(secao, { ...v, titulo: '  Outro  ', perola: ' P2 ', pontos: [' um ', 'dois'] })).toStrictEqual({ title: 'Outro', clinicalPearl: 'P2' });
    expect(mudancasDaSecao(secao, { ...v, titulo: 'Título  ', perola: ' Pérola.', pontos: [' um', 'dois '] })).toStrictEqual({});
    const comEspaco: CamposDaSecao = { ...secao, title: 'Título ', clinicalPearl: 'Pérola. ' };
    expect(mudancasDaSecao(comEspaco, valoresIniciais(comEspaco))).toStrictEqual({});
  });

  it('o texto da seção não é aparado: o que o editor devolve é o que se grava', () => {
    const v = valoresIniciais(secao);
    expect(mudancasDaSecao(secao, { ...v, conteudo: 'Texto.\n\n- a\n- b  ' })).toStrictEqual({ content: 'Texto.\n\n- a\n- b  ' });
  });

  it('ponto vazio some; lista que sobra igual à de antes não é mudança', () => {
    const v = valoresIniciais(secao);
    expect(mudancasDaSecao(secao, { ...v, pontos: ['um', '', 'dois', '   '] })).toStrictEqual({});
    expect(mudancasDaSecao(secao, { ...v, pontos: ['um', '', 'três'] })).toStrictEqual({ keyTakeaways: ['um', 'três'] });
    expect(mudancasDaSecao(secao, { ...v, pontos: [] })).toStrictEqual({ keyTakeaways: [] });
    expect(mudancasDaSecao(secao, { ...v, pontos: ['dois', 'um'] })).toStrictEqual({ keyTakeaways: ['dois', 'um'] });
  });

  it('esvaziar a Pérola ou o Alerta grava ausente (undefined), e a chave existe', () => {
    const v = valoresIniciais(secao);
    const patch = mudancasDaSecao(secao, { ...v, perola: '  ', alerta: '' });
    expect(Object.keys(patch).sort()).toEqual(['clinicalPearl', 'warningAlert']);
    expect(patch.clinicalPearl).toBeUndefined();
    expect(patch.warningAlert).toBeUndefined();
  });

  it('Pérola nova onde não havia (campo ausente)', () => {
    const sem: CamposDaSecao = { title: 'T', content: 'x', keyTakeaways: [] };
    expect(mudancasDaSecao(sem, { ...valoresIniciais(sem), perola: 'Agora há.' })).toStrictEqual({ clinicalPearl: 'Agora há.' });
  });
});
