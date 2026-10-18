import React from 'react';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { getDefaultsFromConfigSchema, openmrsFetch, useConfig } from '@openmrs/esm-framework';
import { type ConfigObject, configSchema } from '../config-schema';
import { toFormValues } from '../url-definition/url-definition';
import SearchByConcepts from './search-by-concepts/search-by-concepts.component';
import SearchByDemographics from './search-by-demographics/search-by-demographics.component';
import SearchByDrugOrder from './search-by-drug-orders/search-by-drug-orders.component';
import { getQueryDetails as getDrugOrderQuery } from './search-by-drug-orders/search-by-drug-orders.utils';
import SearchByEncounters from './search-by-encounters/search-by-encounters.component';
import SearchByEnrollments from './search-by-enrollments/search-by-enrollments.component';
import { getQueryDetails as getEnrollmentQuery } from './search-by-enrollments/search-by-enrollments.utils';

// Carbon's CommonJS build looks flatpickr's locales up by name, but here it gets the module whose only key
// is `default`, so flatpickr never starts and the inputs stay empty. With "en" in place the real picker runs.
const flatpickrLocales = createRequire(import.meta.url)('flatpickr/dist/l10n/index');

const mockOpenmrsFetch = vi.mocked(openmrsFetch);
const mockUseConfig = vi.mocked(useConfig<ConfigObject>);

const program = '64f950e6-1b07-4ac0-8e7e-f3e148f3463f';
const drug = '3cfcf118-931c-46f7-8ff6-7b876f0d4202';

const dateInputs = () => screen.getAllByPlaceholderText('DD-MM-YYYY') as HTMLInputElement[];

/** Picks a date the way a click in the calendar does: flatpickr sets it and reports the change. */
function pick(input: HTMLInputElement, date: Date) {
  act(() => {
    (
      input as HTMLInputElement & { _flatpickr: { setDate: (date: Date, triggerChange: boolean) => void } }
    )._flatpickr.setDate(date, true);
  });
}

describe('date pickers', () => {
  beforeAll(() => {
    flatpickrLocales.en = flatpickrLocales.default.en;
  });

  afterAll(() => {
    delete flatpickrLocales.en;
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T15:30:00Z'));
    mockUseConfig.mockReturnValue(getDefaultsFromConfigSchema(configSchema));
    mockOpenmrsFetch.mockResolvedValue({ data: { results: [] } } as never);
    return () => vi.useRealTimers();
  });

  it.each([
    ['concepts', SearchByConcepts, 2],
    ['demographics', SearchByDemographics, 2],
    ['encounters', SearchByEncounters, 2],
    ['enrollments', SearchByEnrollments, 4],
    ['drug orders', SearchByDrugOrder, 4],
  ])('keep showing a picked date on the %s tab', async (_, Tab, pickers) => {
    render(<Tab onSubmit={vi.fn()} />);
    expect(dateInputs()).toHaveLength(pickers);

    for (const input of dateInputs()) {
      pick(input, new Date(2024, 11, 31));
      await waitFor(() => expect(input).toHaveValue('31-12-2024'));
    }
  });

  it('searches with the picked date', async () => {
    const onSubmit = vi.fn();
    render(<SearchByDemographics onSubmit={onSubmit} />);

    pick(dateInputs()[0], new Date(2024, 11, 31));
    pick(dateInputs()[1], new Date(2025, 0, 1));
    await userEvent.click(screen.getByTestId('search-btn'));

    const [{ query }] = onSubmit.mock.calls[0];
    expect(query.rowFilters.find(({ key }) => key.endsWith('bornDuringPeriod')).parameterValues).toEqual({
      startDate: dayjs(new Date(2024, 11, 31)).format(),
      endDate: dayjs(new Date(2025, 0, 1)).format(),
    });
  });

  it("shows and searches with a definition link's enrollment dates", async () => {
    const onSubmit = vi.fn();
    const { enrollment } = toFormValues(
      {
        v: 1,
        criteria: [
          {
            type: 'enrollment',
            programs: [program],
            enrolledOnOrAfter: '2024-01-01',
            enrolledOnOrBefore: '2024-12-31',
          },
        ],
      },
      new Map(),
    );
    render(<SearchByEnrollments onSubmit={onSubmit} initialValues={enrollment} />);

    await waitFor(() => expect(dateInputs().map((input) => input.value)).toEqual(['01-01-2024', '31-12-2024', '', '']));
    await userEvent.click(screen.getByTestId('search-btn'));
    expect(onSubmit.mock.calls[0][0]).toEqual(getEnrollmentQuery(enrollment));
  });

  it("shows and searches with a definition link's drug order dates", async () => {
    const onSubmit = vi.fn();
    const { drugOrder } = toFormValues(
      {
        v: 1,
        criteria: [{ type: 'drugOrder', drugs: [drug], activeOnOrAfter: 'today', activeOnOrBefore: '2026-12-31' }],
      },
      new Map(),
    );
    render(<SearchByDrugOrder onSubmit={onSubmit} initialValues={drugOrder} />);

    await waitFor(() => expect(dateInputs().map((input) => input.value)).toEqual(['17-10-2026', '31-12-2026', '', '']));
    await userEvent.click(screen.getByTestId('search-btn'));
    expect(onSubmit.mock.calls[0][0]).toEqual(
      getDrugOrderQuery(
        drugOrder,
        getDefaultsFromConfigSchema<ConfigObject>(configSchema).drugOrderSearchDefinitionKey,
      ),
    );
  });
});
