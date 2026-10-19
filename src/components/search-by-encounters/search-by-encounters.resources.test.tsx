import React from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { openmrsFetch } from '@openmrs/esm-framework';
import { useEncounterTypes, useForms } from './search-by-encounters.resources';

const mockOpenmrsFetch = vi.mocked(openmrsFetch);

const freshCache = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

const option = { uuid: 'e22e39fd-7db2-45e7-80f1-60fa0d5a4378', display: 'Admission' };

describe('encounter dropdowns', () => {
  it('ask only for each form uuid and display', async () => {
    mockOpenmrsFetch.mockResolvedValue({ data: { results: [option] } } as never);

    const { result } = renderHook(() => useForms(), { wrapper: freshCache });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockOpenmrsFetch.mock.calls.map(([url]) => url)).toEqual(['/ws/rest/v1/form?v=custom:(uuid,display)']);
    expect(result.current.forms).toEqual([{ id: 0, label: 'Admission', value: option.uuid }]);
  });

  it('ask only for each encounter type uuid and display', async () => {
    mockOpenmrsFetch.mockResolvedValue({ data: { results: [option] } } as never);

    const { result } = renderHook(() => useEncounterTypes(), { wrapper: freshCache });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockOpenmrsFetch.mock.calls.map(([url]) => url)).toEqual([
      '/ws/rest/v1/encountertype?v=custom:(uuid,display)',
    ]);
    expect(result.current.encounterTypes).toEqual([{ id: 0, label: 'Admission', value: option.uuid }]);
  });
});
