import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { getDefaultsFromConfigSchema, openmrsFetch, showSnackbar, useConfig } from '@openmrs/esm-framework';
import { type ConfigObject, configSchema } from '../config-schema';
import type { Query } from '../types';
import CohortBuilder from '../cohort-builder.component';

const programUuid = '64f950e6-1b07-4ac0-8e7e-f3e148f3463f';
const drugUuid = '3cfcf118-931c-46f7-8ff6-7b876f0d4202';
const cohortUuid = 'f4c0b5a2-3c84-4c76-bb7e-6c1b1b2e5a11';
const queryUuid = '0d1b7a4e-6f3c-4b3a-9c3e-2a6f5a8b9c10';
const patientUuid = '8673ee4f-e2ab-4077-ba55-4980f408773e';

// The search tabs are not involved in opening a link and are slow to render.
vi.mock('../components/search-by-concepts/search-by-concepts.component', () => ({ default: () => null }));
vi.mock('../components/search-by-demographics/search-by-demographics.component', () => ({ default: () => null }));
vi.mock('../components/search-by-person-attributes/search-by-person-attributes.component', () => ({
  default: () => null,
}));
vi.mock('../components/search-by-encounters/search-by-encounters.component', () => ({ default: () => null }));
vi.mock('../components/search-by-location/search-by-location.component', () => ({ default: () => null }));
vi.mock('../components/search-by-enrollments/search-by-enrollments.component', () => ({ default: () => null }));
vi.mock('../components/search-by-drug-orders/search-by-drug-orders.component', () => ({ default: () => null }));
vi.mock('../components/composition/composition.component', () => ({ default: () => null }));
vi.mock('../components/saved-cohorts/saved-cohorts.component', () => ({ default: () => null }));
vi.mock('../components/saved-queries/saved-queries.component', () => ({ default: () => null }));

const mockOpenmrsFetch = vi.mocked(openmrsFetch);
const mockUseConfig = vi.mocked(useConfig<ConfigObject>);

const definition = {
  v: 1,
  label: 'Women 15-49 in HIV care on ARVs',
  criteria: [
    { type: 'demographics', gender: 'female', minAge: 15, maxAge: 49 },
    { type: 'enrollment', programs: [programUuid] },
    { type: 'drugOrder', drugs: [drugUuid], activeOnOrAfter: 'today' },
  ],
};

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

const row = (patientId: number) => ({
  patientId,
  firstname: 'Jane',
  lastname: `Doe ${patientId}`,
  age: 30,
  gender: 'F',
});

let adHocQueryResults: Array<ReturnType<typeof row>[] | Error>;

function mockServer() {
  let adHocQueryCalls = 0;
  mockOpenmrsFetch.mockImplementation(async (url: string) => {
    if (url.includes('/reportingrest/adhocquery')) {
      const result = adHocQueryResults[adHocQueryCalls++] ?? [];
      if (result instanceof Error) {
        throw result;
      }
      return { data: { rows: result } } as never;
    }
    if (url.includes(`/program/${programUuid}`)) {
      return { data: { display: 'HIV Care and Treatment' } } as never;
    }
    if (url.includes(`/drug/${drugUuid}`)) {
      throw new Error('Not found');
    }
    if (url.includes(`/cohort/${cohortUuid}/membership`)) {
      return { data: { results: [{ patientUuid, endDate: null, voided: false }] } } as never;
    }
    if (url.includes(`/patient/${patientUuid}`)) {
      const preferredName = { givenName: 'Amina', familyName: 'Otieno' };
      return { data: { patientId: 7, person: { gender: 'F', age: 32, preferredName } } } as never;
    }
    if (url.includes(`/reportingrest/dataSet/${queryUuid}`)) {
      return { data: { rows: [row(9)] } } as never;
    }
    return { data: { results: [] } } as never;
  });
}

const adHocQueryBodies = () =>
  mockOpenmrsFetch.mock.calls
    .filter(([url]) => url.includes('/reportingrest/adhocquery'))
    .map(([, init]) => JSON.parse(JSON.stringify(init.body)) as Query);

const history = () => JSON.parse(window.sessionStorage.getItem('openmrsHistory')) ?? [];

function openBuilderAt(search: string) {
  window.history.replaceState(null, '', `/openmrs/spa/cohort-builder${search}`);
  render(
    <StrictMode>
      <CohortBuilder />
    </StrictMode>,
  );
}

describe('useUrlDefinition', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T15:30:00Z'));
    window.sessionStorage.clear();
    mockUseConfig.mockReturnValue(getDefaultsFromConfigSchema(configSchema));
    adHocQueryResults = [[row(1), row(2), row(3)], [row(2), row(3)], [row(3), row(4)], [row(3)]];
    mockServer();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs each criterion, then ANDs them, once', async () => {
    openBuilderAt(`?definition=${encode(definition)}&tab=1`);

    await waitFor(() => expect(history()).toHaveLength(4));
    expect(history().map(({ description }) => description)).toEqual([
      'Female Patients with ages between 15 and 49 years that are alive',
      'Patients enrolled in HIV Care and Treatment',
      // formatDate is the framework mock's.
      'Patients who taking 1 drug on or after Today, 12:00 AM',
      'Women 15-49 in HIV care on ARVs',
    ]);
    expect(history().map(({ patients }) => patients.length)).toEqual([3, 2, 2, 1]);

    const [demographics, enrollment, drugOrder, composition] = adHocQueryBodies();
    expect(adHocQueryBodies()).toHaveLength(4);
    expect(demographics).toMatchSnapshot('demographics');
    expect(enrollment).toMatchSnapshot('enrollment');
    expect(drugOrder).toMatchSnapshot('drugOrder');
    expect(composition.rowFilters).toEqual([
      ...demographics.rowFilters,
      ...enrollment.rowFilters,
      ...drugOrder.rowFilters,
    ]);
    expect(composition.customRowFilterCombination).toBe('(1 AND 2 AND NOT 3) AND (4) AND (5)');

    expect(window.location.search).toBe('?tab=1');
    expect(await screen.findByText('Jane Doe 3')).toBeInTheDocument();
  });

  it('composes with the newest history entries when history already has searches', async () => {
    window.sessionStorage.setItem(
      'openmrsHistory',
      JSON.stringify([
        { description: 'Earlier search', patients: [], parameters: { rowFilters: [], customRowFilterCombination: '' } },
      ]),
    );
    const twoCriteria = { v: 1, criteria: definition.criteria.slice(0, 2) };
    openBuilderAt(`?definition=${encode(twoCriteria)}`);

    await waitFor(() => expect(history()).toHaveLength(4));
    expect(history()[3].description).toBe('Composition of 2 AND 3');
  });

  it('uses the label for a single criterion and does not compose', async () => {
    openBuilderAt(
      `?definition=${encode({ v: 1, label: '<b>Adults</b>', criteria: [{ type: 'demographics', minAge: 18 }] })}`,
    );

    await waitFor(() => expect(history()).toHaveLength(1));
    expect(history()[0].description).toBe('<b>Adults</b>');
    expect(adHocQueryBodies()).toHaveLength(1);
    expect(await screen.findByText('<b>Adults</b>')).toBeInTheDocument();
  });

  it('keeps the history as it was and shows why when a search fails', async () => {
    const earlierHistory = [{ description: 'Earlier search', patients: [row(8)], parameters: {} }];
    window.sessionStorage.setItem('openmrsHistory', JSON.stringify(earlierHistory));
    // Stock reporting has no builtIn.drugOrderSearch definition, so the drug order search fails.
    adHocQueryResults = [[row(1)], [row(1)], new Error('Internal Server Error')];
    openBuilderAt(`?definition=${encode(definition)}`);

    expect(await screen.findByText('This cohort builder link could not be opened')).toBeInTheDocument();
    expect(
      screen.getByText(
        /^The search "Patients who taking 1 drug .+" failed, so none of this link's searches were kept$/,
      ),
    ).toBeInTheDocument();
    expect(showSnackbar).toHaveBeenCalledWith(expect.objectContaining({ subtitle: 'Internal Server Error' }));
    expect(adHocQueryBodies()).toHaveLength(3);
    expect(history()).toEqual(earlierHistory);
    await waitFor(() =>
      expect(screen.queryByText('Patients enrolled in HIV Care and Treatment')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Earlier search')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Drug Order' })).toBeEnabled();
  });

  it('uses the configured drug order search definition key', async () => {
    mockUseConfig.mockReturnValue({
      drugOrderSearchDefinitionKey: 'configuration.definitionlibrary.cohort.drugOrderSearch',
    });
    openBuilderAt(`?definition=${encode({ v: 1, criteria: [definition.criteria[2]] })}`);

    await waitFor(() => expect(history()).toHaveLength(1));
    expect(adHocQueryBodies()[0].rowFilters.map(({ key }) => key)).toEqual([
      'configuration.definitionlibrary.cohort.drugOrderSearch',
    ]);
  });

  it.each([
    ['not base64url', 'definition=%%%', 'Definition is not valid base64url'],
    [
      'an unknown key',
      `definition=${encode({ ...definition, sql: 'drop table' })}`,
      'Definition has an unknown key "sql"',
    ],
    ['too large', `definition=${'A'.repeat(6000)}`, 'Definition is larger than 4096 bytes'],
    ['a cohort that is not a uuid', 'cohort=..%2F..%2Fuser', '"cohort" must be a uuid'],
  ])('shows an error, runs nothing and clears the URL when it is %s', async (_, search, message) => {
    openBuilderAt(`?${search}`);

    expect(await screen.findByText('This cohort builder link could not be opened')).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(adHocQueryBodies()).toHaveLength(0);
    expect(
      mockOpenmrsFetch.mock.calls.some(([url]) => /\/(cohort|patient|program|drug)\/|adhocquery|dataSet\//.test(url)),
    ).toBe(false);
    expect(history()).toHaveLength(0);
  });

  it('shows the members of a saved cohort', async () => {
    openBuilderAt(`?cohort=${cohortUuid}`);

    expect(await screen.findByText('Amina Otieno')).toBeInTheDocument();
    expect(mockOpenmrsFetch).toHaveBeenCalledWith(expect.stringContaining(`/cohort/${cohortUuid}/membership?`));
    expect(mockOpenmrsFetch.mock.calls.filter(([url]) => url.includes('/membership'))).toHaveLength(1);
    expect(window.location.search).toBe('');
  });

  it('runs a saved query', async () => {
    openBuilderAt(`?query=${queryUuid}`);

    expect(await screen.findByText('Jane Doe 9')).toBeInTheDocument();
    expect(
      mockOpenmrsFetch.mock.calls.filter(([url]) => url.includes(`/reportingrest/dataSet/${queryUuid}`)),
    ).toHaveLength(1);
    expect(window.location.search).toBe('');
  });

  it('does nothing without URL params', async () => {
    openBuilderAt('?tab=1');

    await screen.findByText('Search History');
    expect(adHocQueryBodies()).toHaveLength(0);
    expect(window.location.search).toBe('?tab=1');
    expect(screen.queryByText('This cohort builder link could not be opened')).not.toBeInTheDocument();
  });
});
