import React from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { openmrsFetch } from '@openmrs/esm-framework';
import { usePrograms } from './search-by-enrollments.resources';

const mockOpenmrsFetch = vi.mocked(openmrsFetch);

const freshCache = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

describe('usePrograms', () => {
  // The default program representation converts every workflow, and one bad workflow fails the whole
  // list with a 400. The dropdown only shows names, so it asks for nothing else.
  it('asks only for each program uuid and name', async () => {
    mockOpenmrsFetch.mockResolvedValue({
      data: { results: [{ uuid: '64f950e6-1b07-4ac0-8e7e-f3e148f3463f', name: 'HIV Care and Treatment' }] },
    } as never);

    const { result } = renderHook(() => usePrograms(), { wrapper: freshCache });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockOpenmrsFetch).toHaveBeenCalledTimes(1);
    expect(mockOpenmrsFetch.mock.calls[0][0]).toBe('/ws/rest/v1/program?v=custom:(uuid,name)');
    expect(result.current.programs).toEqual([
      { id: 0, label: 'HIV Care and Treatment', value: '64f950e6-1b07-4ac0-8e7e-f3e148f3463f' },
    ]);
  });
});
