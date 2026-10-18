import React from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { openmrsFetch } from '@openmrs/esm-framework';
import { useCareSettings, useDrugs } from './search-by-drug-orders.resources';

const mockOpenmrsFetch = vi.mocked(openmrsFetch);

const freshCache = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

const option = { uuid: '8891ef84-08d3-5e23-8d81-f7a528a2591d', display: 'Tenofovir' };

describe('drug order dropdowns', () => {
  it('ask only for each drug uuid and display', async () => {
    mockOpenmrsFetch.mockResolvedValue({ data: { results: [option] } } as never);

    const { result } = renderHook(() => useDrugs(), { wrapper: freshCache });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockOpenmrsFetch.mock.calls.map(([url]) => url)).toEqual(['/ws/rest/v1/drug?v=custom:(uuid,display)']);
    expect(result.current.drugs).toEqual([{ id: 0, label: 'Tenofovir', value: option.uuid }]);
  });

  it('ask only for each care setting uuid and display', async () => {
    mockOpenmrsFetch.mockResolvedValue({ data: { results: [option] } } as never);

    const { result } = renderHook(() => useCareSettings(), { wrapper: freshCache });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockOpenmrsFetch.mock.calls.map(([url]) => url)).toEqual([
      '/ws/rest/v1/caresetting?v=custom:(uuid,display)',
    ]);
    expect(result.current.careSettings).toEqual([{ id: 0, label: 'Tenofovir', value: option.uuid }]);
  });
});
