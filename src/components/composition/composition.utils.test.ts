import { describe, it, expect, beforeEach } from 'vitest';
import type { Query } from '../../types';
import { composeQueries, createCompositionQuery } from './composition.utils';

const rowFilter = (key: string) => ({
  type: 'org.openmrs.module.reporting.dataset.definition.PatientDataSetDefinition',
  key: `reporting.library.cohortDefinition.builtIn.${key}`,
});

const setHistory = (items: Array<{ rowFilters: unknown[]; customRowFilterCombination: string }>) => {
  window.sessionStorage.setItem('openmrsHistory', JSON.stringify(items.map((parameters) => ({ parameters }))));
};

describe('createCompositionQuery', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('renumbers every filter of a history item by the number of filters already in the query', () => {
    setHistory([
      { rowFilters: [rowFilter('males')], customRowFilterCombination: '1' },
      {
        rowFilters: [rowFilter('ageRangeOnDate'), rowFilter('diedDuringPeriod'), rowFilter('encounterSearchAdvanced')],
        customRowFilterCombination: '1 AND 2 AND NOT 3',
      },
    ]);

    const { query } = createCompositionQuery('1 AND 2');

    expect(query.rowFilters).toHaveLength(4);
    expect(query.customRowFilterCombination).toBe('(1) AND (2 AND 3 AND NOT 4)');
  });

  it('renumbers multi-digit filter numbers', () => {
    setHistory([
      {
        rowFilters: Array.from({ length: 10 }, (_, i) => rowFilter(`filter${i + 1}`)),
        customRowFilterCombination: '1 AND 10',
      },
      { rowFilters: [rowFilter('males'), rowFilter('females')], customRowFilterCombination: '1 OR 2' },
    ]);

    const { query } = createCompositionQuery('1 AND 2');

    expect(query.rowFilters).toHaveLength(12);
    expect(query.customRowFilterCombination).toBe('(1 AND 10) AND (11 OR 12)');
  });
});

describe('composeQueries', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('ANDs queries exactly as the Composition tab ANDs the same searches from history', () => {
    const searches = [
      { rowFilters: [rowFilter('males')], customRowFilterCombination: '1' },
      {
        rowFilters: [rowFilter('ageRangeOnDate'), rowFilter('diedDuringPeriod')],
        customRowFilterCombination: '1 AND NOT 2',
      },
      { rowFilters: [rowFilter('patientsWithEnrollment')], customRowFilterCombination: '1' },
    ];
    setHistory(searches);
    const fromHistory = createCompositionQuery('1 AND 2 AND 3');

    expect(composeQueries(searches as Array<Query>)).toEqual(fromHistory);
    expect(fromHistory.query.customRowFilterCombination).toBe('(1) AND (2 AND NOT 3) AND (4)');
  });

  it('leaves the queries it was given as they were', () => {
    const search = { rowFilters: [rowFilter('males')], customRowFilterCombination: '1' };
    composeQueries([search, { ...search }] as Array<Query>);
    expect(search).toEqual({ rowFilters: [rowFilter('males')], customRowFilterCombination: '1' });
  });
});
