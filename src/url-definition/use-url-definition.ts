import { useEffect, useRef, useState } from 'react';
import type { SearchParams } from '../types';
import { createCompositionQuery } from '../components/composition/composition.utils';
import { getSearchHistory } from '../components/search-history/search-history.utils';
import {
  andLastEntries,
  buildSearch,
  type CohortDefinition,
  readUrlRequest,
  URL_PARAMS,
  type UrlRequest,
} from './url-definition';
import { fetchDisplayNames } from './url-definition.resources';

type RunSearch = (searchParams: SearchParams, description: string) => Promise<boolean>;

interface UrlDefinitionHandlers {
  runSearch: RunSearch;
  showCohort: (cohortUuid: string) => Promise<void>;
  showQuery: (queryUuid: string) => Promise<void>;
}

/**
 * Runs the definition, saved cohort or saved query named in the page URL, once, and removes it
 * from the URL so a reload does not run it again. Returns why the URL was rejected, if it was.
 */
export function useUrlDefinition({ runSearch, showCohort, showQuery }: UrlDefinitionHandlers): string | null {
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in development; the URL must only be consumed once.
    if (hasRun.current) {
      return;
    }
    hasRun.current = true;

    const params = new URLSearchParams(window.location.search);
    if (!URL_PARAMS.some((name) => params.has(name))) {
      return;
    }
    removeUrlParams();

    let request: UrlRequest;
    try {
      request = readUrlRequest(params);
    } catch (invalidUrlError) {
      setError(invalidUrlError.message);
      return;
    }
    runRequest(request, { runSearch, showCohort, showQuery });
  }, [runSearch, showCohort, showQuery]);

  return error;
}

function removeUrlParams() {
  const url = new URL(window.location.href);
  URL_PARAMS.forEach((name) => url.searchParams.delete(name));
  window.history.replaceState(window.history.state, '', url);
}

async function runRequest(request: UrlRequest, { runSearch, showCohort, showQuery }: UrlDefinitionHandlers) {
  switch (request.type) {
    case 'cohort':
      return showCohort(request.uuid);
    case 'query':
      return showQuery(request.uuid);
    case 'definition':
      return runDefinition(request.definition, runSearch);
  }
}

async function runDefinition(definition: CohortDefinition, runSearch: RunSearch) {
  const { label, criteria } = definition;
  const names = await fetchDisplayNames(definition);

  for (const criterion of criteria) {
    const { searchParams, description } = buildSearch(criterion, names);
    // A single criterion is the whole result, so it carries the label; otherwise the composition does.
    const succeeded = await runSearch(searchParams, criteria.length === 1 && label ? label : description);
    if (!succeeded) {
      // A failed search adds no history entry, so the composition would point at the wrong entries.
      return;
    }
  }

  if (criteria.length >= 2) {
    const composition = andLastEntries(getSearchHistory().length, criteria.length);
    await runSearch(createCompositionQuery(composition), label || `Composition of ${composition}`);
  }
}
