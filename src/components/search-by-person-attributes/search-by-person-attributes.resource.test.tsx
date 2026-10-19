import React from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { openmrsFetch } from '@openmrs/esm-framework';
import { usePersonAttributes } from './search-by-person-attributes.resource';

const mockOpenmrsFetch = vi.mocked(openmrsFetch);

const freshCache = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

describe('usePersonAttributes', () => {
  it('asks only for each person attribute type uuid and display', async () => {
    const option = { uuid: '14d4f066-15f5-102d-96e4-000c29c2a5d7', display: 'Telephone Number' };
    mockOpenmrsFetch.mockResolvedValue({ data: { results: [option] } } as never);

    const { result } = renderHook(() => usePersonAttributes(), { wrapper: freshCache });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockOpenmrsFetch.mock.calls.map(([url]) => url)).toEqual([
      '/ws/rest/v1/personattributetype?v=custom:(uuid,display)',
    ]);
    expect(result.current.personAttributes).toEqual([{ id: 0, label: 'Telephone Number', value: option.uuid }]);
  });
});
