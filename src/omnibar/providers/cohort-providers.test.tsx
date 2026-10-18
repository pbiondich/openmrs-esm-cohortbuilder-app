import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  type FetchResponse,
  getDefaultsFromConfigSchema,
  openmrsFetch,
  restBaseUrl,
  useConfig,
} from '@openmrs/esm-framework';
import { type ConfigObject, configSchema } from '../../config-schema';
import routes from '../../routes.json';
import {
  OMNIBAR_CONTRACT_VERSION,
  type OmnibarContext,
  type OmnibarProviderProps,
  type OmnibarQueryHints,
  type OmnibarReport,
} from '../omnibar-contract';
import { savedSearchCacheMs, savedSearchDelayMs } from '../saved-search.resource';
import CohortBuilderProvider from './cohort-builder.provider';
import CohortCriteriaProvider from './cohort-criteria.provider';
import SavedCohortsProvider from './saved-cohorts.provider';
import SavedQueriesProvider from './saved-queries.provider';

// A real i18next instance, so plurals and default texts come out as the app shell shows them.
vi.mock('react-i18next', async () => {
  const { default: i18next } = await import('i18next');
  const i18n = i18next.createInstance();
  await i18n.init({ lng: 'en', resources: { en: { translation: {} } } });
  // Stable, as react-i18next's own t is.
  const t = i18n.t.bind(i18n);
  return { useTranslation: () => ({ t }) };
});

const mockUseConfig = vi.mocked(useConfig<ConfigObject>);
const mockOpenmrsFetch = vi.mocked(openmrsFetch);

const hiv = '64f950e6-1b07-4ac0-8e7e-f3e148f3463f';
const tdf = '0b8c3c4e-2f9a-4b1e-9d5c-1a2b3c4d5e6f';
const cohortUuid = '8673ee4f-e2ab-4077-ba55-4980f408773e';
const queryUuid = '5b0e0b4b-6d1d-4a8a-9d9e-0e6f2a1c3b4d';

const global: OmnibarContext = { scope: 'global', locale: 'en', workspaceGroup: null };
const inChart: OmnibarContext = { scope: 'patient', patientUuid: cohortUuid, locale: 'en' };

const providers = [
  ['criteria', CohortCriteriaProvider],
  ['builder', CohortBuilderProvider],
  ['saved cohorts', SavedCohortsProvider],
  ['saved queries', SavedQueriesProvider],
] as const;

function testConfig(): ConfigObject {
  const defaults = getDefaultsFromConfigSchema(configSchema) as ConfigObject;
  return {
    ...defaults,
    drugCriteriaEnabled: true,
    omnibar: {
      ...defaults.omnibar,
      programs: [{ uuid: hiv, label: 'HIV Program', aliases: ['hiv'] }],
      drugGroups: [{ id: 'arv', label: 'ARVs', aliases: ['arvs'], drugUuids: [tdf], cielConceptUuids: [] }],
    },
  };
}

function useTestConfig(change: (config: ConfigObject) => ConfigObject = (config) => config) {
  mockUseConfig.mockReturnValue(change(testConfig()));
}

/** Mounted as the host mounts a provider: with a host's props, and hints worked out by the host. */
function renderProvider(
  Provider: React.FC<OmnibarProviderProps>,
  query: string,
  context = global,
  hints?: OmnibarQueryHints,
) {
  const report = vi.fn<(report: OmnibarReport) => void>();
  const props = (next: string, nextContext: OmnibarContext, nextHints: OmnibarQueryHints) => ({
    query: next,
    context: nextContext,
    report,
    hints: nextHints,
    contractVersion: nextHints ? OMNIBAR_CONTRACT_VERSION : undefined,
  });
  const view = render(<Provider {...props(query, context, hints)} />);
  const rerender = (next: string, nextContext = context, nextHints = hints) =>
    view.rerender(<Provider {...props(next, nextContext, nextHints)} />);
  const last = () => report.mock.calls.at(-1)[0];
  return { report, rerender, last };
}

const decodeDefinition = (to: string) => {
  const param = new URLSearchParams(to.split('?')[1]).get('definition');
  return JSON.parse(Buffer.from(param, 'base64url').toString('utf8'));
};

describe('cohort providers in routes.json', () => {
  it.each([
    ['omnibar-cohort-criteria-provider', 'cohortCriteriaOmnibarProvider', 20, ['Get Patients', 'Run Reports']],
    ['omnibar-cohort-builder-provider', 'cohortBuilderOmnibarProvider', 30, ['Get Patients', 'Run Reports']],
    ['omnibar-saved-cohorts-provider', 'savedCohortsOmnibarProvider', 40, ['Get Patient Cohorts', 'Get Patients']],
    [
      'omnibar-saved-queries-provider',
      'savedQueriesOmnibarProvider',
      50,
      ['View Reports', 'Run Reports', 'Get Patients'],
    ],
  ])(
    'declares %s for global scope only, on contract 1, with the privileges its backend checks',
    (name, component, order, privileges) => {
      const extension: Record<string, unknown> = routes.extensions.find((e) => e.name === name);
      expect(extension).toMatchObject({ component, slot: 'omnibar-providers-slot', privileges });
      expect(extension.meta).toEqual({ lane: 'navigate', scopes: ['global'], order, contract: 1 });
      expect(extension).not.toHaveProperty('offline');
      expect(extension).not.toHaveProperty('online');
    },
  );
});

describe('every cohort provider', () => {
  beforeEach(() => useTestConfig());

  it.each(providers)(
    'the %s row reports on every query, idle when it has nothing, and echoes the query',
    (_, Provider) => {
      const { rerender, report } = renderProvider(Provider, '');
      for (const query of ['z', 'q', '']) {
        rerender(query);
      }
      expect(report.mock.calls.map(([{ query, status }]) => [query, status])).toEqual([
        ['', 'idle'],
        ['z', 'idle'],
        ['q', 'idle'],
        ['', 'idle'],
      ]);
      expect(report.mock.calls.every(([{ title }]) => typeof title === 'string' && title)).toBe(true);
    },
  );

  it.each(providers)(
    'the %s row stays idle and fetches nothing while the omnibar rows are turned off',
    async (_, Provider) => {
      vi.useFakeTimers();
      onTestFinished(() => {
        vi.useRealTimers();
      });
      useTestConfig((config) => ({ ...config, omnibar: { ...config.omnibar, enabled: false } }));
      const { last, rerender } = renderProvider(Provider, 'women aged 15-49 on ARVs');
      expect(last()).toMatchObject({ status: 'idle' });
      for (const query of ['cohort', 'hiv clinic']) {
        rerender(query);
        expect(last()).toMatchObject({ query, status: 'idle' });
      }
      await act(async () => {
        vi.advanceTimersByTime(savedSearchDelayMs * 2);
      });
      expect(last().results).toBeUndefined();
      expect(mockOpenmrsFetch).not.toHaveBeenCalled();
    },
  );

  it.each(providers)('the %s row offers nothing for text the host says looks like an identifier', (_, Provider) => {
    const { last } = renderProvider(Provider, 'cohort women', global, { looksLikeIdentifier: true });
    expect(last()).toMatchObject({ query: 'cohort women', status: 'idle' });
    expect(mockOpenmrsFetch).not.toHaveBeenCalled();
  });

  it.each(providers)(
    'the %s row works out the identifier shape itself on a host that gives no hints',
    (_, Provider) => {
      for (const query of ['cohort 100GEJ', 'women 1234567', 'MRN-1234']) {
        const { last } = renderProvider(Provider, query);
        expect(last()).toMatchObject({ query, status: 'idle' });
      }
      expect(mockOpenmrsFetch).not.toHaveBeenCalled();
    },
  );
});

describe('CohortBuilderProvider', () => {
  beforeEach(() => useTestConfig());

  it.each([
    'cohorts',
    'cohort',
    'Cohort Builder',
    'build cohort',
    'build a cohort of women',
    'find patients who are pregnant',
  ])('offers the Cohort Builder for %j', (query) => {
    const { last } = renderProvider(CohortBuilderProvider, query, global, { looksLikeIdentifier: false });
    expect(last()).toMatchObject({ query, status: 'ready', title: 'Cohorts' });
    expect(last().results).toEqual([
      {
        id: 'cohort-builder',
        title: 'Cohort Builder',
        subtitle: 'Find patients by age, gender, program, drug orders and more',
        target: { type: 'navigate', to: '${openmrsSpaBase}/cohort-builder' },
      },
    ]);
  });

  it.each(['co', 'coh', 'cohor', 'build', 'mary', '100GEJ', 'cd4', 'findings'])('stays quiet for %j', (query) => {
    const { last } = renderProvider(CohortBuilderProvider, query);
    expect(last()).toMatchObject({ status: 'idle' });
    expect(last().results).toBeUndefined();
  });

  it('offers nothing inside a chart', () => {
    const { last } = renderProvider(CohortBuilderProvider, 'cohort builder', inChart);
    expect(last()).toMatchObject({ status: 'idle' });
    expect(last().results).toBeUndefined();
  });
});

describe('CohortCriteriaProvider', () => {
  beforeEach(() => useTestConfig());

  it('offers exactly one row, which opens the cohort builder pre-filled with the parsed definition', () => {
    const { last } = renderProvider(CohortCriteriaProvider, 'women aged 15-49 on ARVs');
    expect(last()).toMatchObject({ query: 'women aged 15-49 on ARVs', status: 'ready', title: 'Cohorts' });
    expect(last().results).toHaveLength(1);
    const [row] = last().results;
    expect(row).toMatchObject({
      id: 'cohort-definition',
      title: 'Build cohort: Female patients aged 15–49 on ARVs',
      subtitle: 'Runs this search in the Cohort Builder',
    });
    expect(row.target.type).toBe('navigate');
    const to = (row.target as { to: string }).to;
    expect(to.startsWith('${openmrsSpaBase}/cohort-builder?definition=')).toBe(true);
    expect(decodeDefinition(to)).toEqual({
      v: 1,
      label: 'Female patients aged 15–49 on ARVs',
      criteria: [
        { type: 'demographics', gender: 'female', minAge: 15, maxAge: 49 },
        { type: 'drugOrder', drugs: [tdf], activeOnOrAfter: 'today' },
      ],
    });
  });

  it('shows a config label exactly as written, neither escaped twice nor read as HTML', () => {
    useTestConfig((config) => ({
      ...config,
      omnibar: { ...config.omnibar, programs: [{ uuid: hiv, label: "<b>Mother's</b> clinic", aliases: ['mch'] }] },
    }));
    const { last } = renderProvider(CohortCriteriaProvider, 'enrolled in mch');
    const [row] = last().results;
    expect(row.title).toBe("Build cohort: Patients in <b>Mother's</b> clinic");
    render(<span>{row.title}</span>);
    expect(screen.getByText("Build cohort: Patients in <b>Mother's</b> clinic")).toBeInTheDocument();
    expect(screen.queryByText("Mother's")).not.toBeInTheDocument();
  });

  it('offers nothing for a drug group while the top-level drugCriteriaEnabled is off', () => {
    useTestConfig((config) => ({ ...config, drugCriteriaEnabled: false }));
    const { last, rerender } = renderProvider(CohortCriteriaProvider, 'women aged 15-49 on ARVs');
    expect(last()).toMatchObject({ status: 'idle' });
    expect(last().results).toBeUndefined();
    rerender('women aged 15-49');
    expect(last().results).toHaveLength(1);
  });

  it('offers nothing for text it cannot fully parse, or for a patient id', () => {
    const { last, rerender } = renderProvider(CohortCriteriaProvider, 'women with diabetes');
    expect(last()).toMatchObject({ status: 'idle' });
    expect(last().results).toBeUndefined();
    rerender('123456');
    expect(last()).toMatchObject({ query: '123456', status: 'idle' });
  });

  it('offers nothing when the definition is too big for a link', () => {
    const drugUuids = Array.from({ length: 50 }, (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`);
    useTestConfig((config) => ({
      ...config,
      omnibar: {
        ...config.omnibar,
        drugGroups: ['a', 'b', 'c', 'd', 'e'].map((id) => ({
          id,
          label: id,
          aliases: [`drug${id}`],
          drugUuids,
          cielConceptUuids: [],
        })),
      },
    }));
    const { last } = renderProvider(CohortCriteriaProvider, 'on druga on drugb on drugc on drugd on druge');
    expect(last()).toMatchObject({ status: 'idle' });
    expect(last().results).toBeUndefined();
  });

  it('offers nothing inside a chart', () => {
    const { last } = renderProvider(CohortCriteriaProvider, 'women on ARVs', inChart);
    expect(last()).toMatchObject({ status: 'idle' });
    expect(last().results).toBeUndefined();
  });

  it('never touches the network while the user types', () => {
    const { rerender } = renderProvider(CohortCriteriaProvider, 'w');
    for (const query of ['wo', 'women', 'women in', 'women in hiv program', 'women in hiv program on arvs']) {
      rerender(query);
    }
    expect(mockOpenmrsFetch).not.toHaveBeenCalled();
  });
});

describe('saved cohorts and saved queries', () => {
  let queryCounter = 0;
  let hoursPassed = 0;
  /** Cohort searches are cached by URL, so each test searches for words of its own. */
  const fresh = (word: string) => `${word}${++queryCounter}`;

  const respond = (data: unknown) => mockOpenmrsFetch.mockResolvedValue({ data } as FetchResponse);
  const settle = async () => {
    await act(async () => {
      vi.advanceTimersByTime(savedSearchDelayMs);
    });
  };
  const requestedUrl = (call = -1) => new URL(mockOpenmrsFetch.mock.calls.at(call)[0], 'http://localhost');

  beforeEach(() => {
    useTestConfig();
    vi.useFakeTimers();
    // An hour on per test, so no test sees a list another one cached.
    vi.setSystemTime(Date.UTC(2026, 9, 17) + ++hoursPassed * 3_600_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists saved cohorts that open in the cohort builder, skipping voided ones and bad uuids', async () => {
    respond({
      results: [
        { uuid: cohortUuid, name: 'HIV clinic', description: 'Everyone in care', size: 42, voided: false },
        { uuid: '2e9f6d2b-0c41-4b7e-9d0b-9f7c3b0d1a11', name: 'Old list', voided: true },
        { uuid: '../../../ws/rest/v1/session?leak=1', name: 'Forged', voided: false },
      ],
    });
    const query = fresh('hiv');
    const { last } = renderProvider(SavedCohortsProvider, query);
    expect(last()).toMatchObject({ query, status: 'loading', results: [] });

    await settle();

    expect(mockOpenmrsFetch).toHaveBeenCalledTimes(1);
    expect(requestedUrl().pathname).toBe(`/ws/rest/v1/cohort`);
    expect(requestedUrl().searchParams.get('q')).toBe(query);
    expect(last()).toMatchObject({ query, status: 'ready', title: 'Saved cohorts' });
    expect(last().results).toEqual([
      {
        id: `cohort:${cohortUuid}`,
        title: 'HIV clinic',
        subtitle: 'Everyone in care · 42 members',
        target: { type: 'navigate', to: `\${openmrsSpaBase}/cohort-builder?cohort=${cohortUuid}` },
      },
    ]);
  });

  it('says how many members a saved cohort has', async () => {
    respond({
      results: [
        { uuid: cohortUuid, name: 'One', size: 1 },
        { uuid: '2e9f6d2b-0c41-4b7e-9d0b-9f7c3b0d1a11', name: 'None', size: 0 },
        { uuid: '3f0a7e3c-1d52-4c8f-8e1c-0a8d4c1e2b22', name: 'Unknown' },
      ],
    });
    const { last } = renderProvider(SavedCohortsProvider, fresh('size'));
    await settle();
    expect(last().results.map((result) => result.subtitle)).toEqual([
      '1 member',
      '0 members',
      'Open in the Cohort Builder',
    ]);
  });

  it('asks for the saved query prefix and matches the typed text against the name without it', async () => {
    respond({
      results: [
        { uuid: queryUuid, name: '[AdHocDataExport] Women on ARVs' },
        { uuid: '2e9f6d2b-0c41-4b7e-9d0b-9f7c3b0d1a11', name: '[AdHocDataExport] Men over 50' },
        { uuid: '3f0a7e3c-1d52-4c8f-8e1c-0a8d4c1e2b22', name: 'Women report data set' },
      ],
    });
    const { last } = renderProvider(SavedQueriesProvider, 'WOMEN');

    await settle();

    const raw = mockOpenmrsFetch.mock.calls[0][0] as string;
    expect(raw).toContain('q=%5BAdHocDataExport%5D');
    expect(requestedUrl().pathname).toBe(`/ws/rest/v1/reportingrest/dataSetDefinition`);
    expect(requestedUrl().searchParams.get('q')).toBe('[AdHocDataExport]');
    expect(requestedUrl().searchParams.get('limit')).toBe('100');
    expect(last()).toMatchObject({ title: 'Saved queries' });
    expect(last().results).toEqual([
      {
        id: `query:${queryUuid}`,
        title: 'Women on ARVs',
        subtitle: 'Run in the Cohort Builder',
        target: { type: 'navigate', to: `\${openmrsSpaBase}/cohort-builder?query=${queryUuid}` },
      },
    ]);
  });

  it('serves every keystroke from one saved query list, and fetches it again after a minute', async () => {
    respond({ results: [{ uuid: queryUuid, name: '[AdHocDataExport] Women on ARVs' }] });
    const { rerender, last } = renderProvider(SavedQueriesProvider, 'wo');
    await settle();
    for (const query of ['wom', 'women', 'men']) {
      rerender(query);
      await settle();
      expect(last()).toMatchObject({
        query,
        status: 'ready',
        results: [expect.objectContaining({ id: `query:${queryUuid}` })],
      });
    }
    rerender('arv x');
    await settle();
    expect(last()).toMatchObject({ query: 'arv x', status: 'ready', results: [] });
    expect(mockOpenmrsFetch).toHaveBeenCalledTimes(1);

    // The next time the panel opens, the providers mount again.
    renderProvider(SavedQueriesProvider, 'women');
    await settle();
    expect(mockOpenmrsFetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + savedSearchCacheMs);
    renderProvider(SavedQueriesProvider, 'women');
    await settle();
    expect(mockOpenmrsFetch).toHaveBeenCalledTimes(2);
  });

  it('encodes the query in the request', async () => {
    respond({ results: [] });
    const query = `${fresh('a')}&v=full #x`;
    renderProvider(SavedCohortsProvider, query);

    await settle();

    const raw = mockOpenmrsFetch.mock.calls[0][0] as string;
    expect(raw.startsWith(`${restBaseUrl}/cohort?`)).toBe(true);
    expect(raw).not.toContain('&v=full #x');
    expect(requestedUrl().searchParams.get('q')).toBe(query);
    expect(requestedUrl().searchParams.get('v')).toBe('custom:(uuid,name,description,size,voided)');
  });

  it('waits for typing to pause and asks only for the last query', async () => {
    respond({ results: [] });
    const base = fresh('tb');
    const { rerender } = renderProvider(SavedCohortsProvider, base);
    act(() => vi.advanceTimersByTime(savedSearchDelayMs - 50));
    rerender(`${base} c`);
    act(() => vi.advanceTimersByTime(savedSearchDelayMs - 50));
    rerender(`${base} cl`);

    await settle();

    expect(mockOpenmrsFetch).toHaveBeenCalledTimes(1);
    expect(requestedUrl().searchParams.get('q')).toBe(`${base} cl`);
  });

  it('aborts a request the user has typed past and ignores its late answer', async () => {
    let resolveFirst: (response: FetchResponse) => void;
    mockOpenmrsFetch.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    const first = fresh('mal');
    const { rerender, last } = renderProvider(SavedCohortsProvider, first);
    await settle();
    const firstSignal = (mockOpenmrsFetch.mock.calls[0][1] as RequestInit).signal;
    expect(firstSignal.aborted).toBe(false);

    respond({ results: [] });
    rerender(`${first}aria`);
    expect(firstSignal.aborted).toBe(true);
    await settle();
    await act(async () => {
      resolveFirst({ data: { results: [{ uuid: cohortUuid, name: 'Stale' }] } } as FetchResponse);
    });

    expect(last()).toMatchObject({ query: `${first}aria`, status: 'ready', results: [] });
  });

  it('remembers an answer, so going back to a query does not fetch it again', async () => {
    respond({ results: [{ uuid: cohortUuid, name: 'ANC' }] });
    const query = fresh('anc');
    const { rerender, last } = renderProvider(SavedCohortsProvider, query);
    await settle();
    rerender(`${query}x`);
    await settle();
    expect(mockOpenmrsFetch).toHaveBeenCalledTimes(2);

    rerender(query);
    expect(last()).toMatchObject({ query, status: 'ready', results: [expect.objectContaining({ title: 'ANC' })] });
    await settle();
    expect(mockOpenmrsFetch).toHaveBeenCalledTimes(2);
  });

  it('needs two characters and stays out of charts', async () => {
    const { rerender, last } = renderProvider(SavedCohortsProvider, 'h');
    await settle();
    expect(last()).toMatchObject({ status: 'idle' });
    rerender(fresh('hiv'), inChart);
    await settle();
    expect(last()).toMatchObject({ status: 'idle' });

    const { last: lastQueries } = renderProvider(SavedQueriesProvider, fresh('hiv'), inChart);
    await settle();
    expect(lastQueries()).toMatchObject({ status: 'idle' });
    expect(mockOpenmrsFetch).not.toHaveBeenCalled();
  });

  it.each(['100GEJ', '4861TU-4', '123456', 'MRN-1234'])('leaves the id %j to patient search', async (id) => {
    const { last: lastCohorts } = renderProvider(SavedCohortsProvider, id);
    const { last: lastQueries } = renderProvider(SavedQueriesProvider, id);
    await settle();
    expect(lastCohorts()).toMatchObject({ query: id, status: 'idle' });
    expect(lastQueries()).toMatchObject({ query: id, status: 'idle' });
    expect(mockOpenmrsFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['offline', new TypeError('Failed to fetch')],
    ['a gateway timeout', Object.assign(new Error('Gateway Timeout'), { response: { status: 504 } })],
    ['the server down behind a proxy', Object.assign(new Error('Service Unavailable'), { response: { status: 503 } })],
  ])('reports one quiet unavailable line when %s', async (_, failure) => {
    mockOpenmrsFetch.mockRejectedValue(failure);
    const { last: lastCohorts } = renderProvider(SavedCohortsProvider, fresh('art'));
    const { last: lastQueries } = renderProvider(SavedQueriesProvider, fresh('art'));
    await settle();
    for (const [report, title] of [
      [lastCohorts(), 'Saved cohorts'],
      [lastQueries(), 'Saved queries'],
    ] as const) {
      expect(report).toEqual({ query: expect.any(String), title, status: 'error', detail: { state: 'unavailable' } });
    }
  });

  it('reports any other failed search as a plain error', async () => {
    mockOpenmrsFetch.mockRejectedValue(Object.assign(new Error('Forbidden'), { response: { status: 403 } }));
    const { last } = renderProvider(SavedQueriesProvider, fresh('art'));
    await settle();
    expect(last()).toEqual({ query: expect.any(String), title: 'Saved queries', status: 'error' });
  });
});
