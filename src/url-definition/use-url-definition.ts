import { useEffect, useRef, useState } from 'react';
import { useConfig } from '@openmrs/esm-framework';
import type { SearchParams } from '../types';
import { type ConfigObject } from '../config-schema';
import { createCompositionQuery } from '../components/composition/composition.utils';
import { getSearchHistory } from '../components/search-history/search-history.utils';
import {
  andLastEntries,
  buildSearch,
  type CohortDefinition,
  readUrlRequest,
  type Search,
  URL_PARAMS,
  type UrlRequest,
} from './url-definition';
import { fetchDisplayNames } from './url-definition.resources';

interface UrlDefinitionHandlers {
  runSearch: (searchParams: SearchParams, description: string) => Promise<boolean>;
  showCohort: (cohortUuid: string) => Promise<void>;
  showQuery: (queryUuid: string) => Promise<void>;
  onHistoryChange: () => void;
}

/**
 * Runs the definition, saved cohort or saved query named in the page URL, once, and removes it
 * from the URL so a reload does not run it again. Returns why the link could not be opened, if it could not.
 */
export function useUrlDefinition({
  runSearch,
  showCohort,
  showQuery,
  onHistoryChange,
}: UrlDefinitionHandlers): string | null {
  const { drugOrderSearchDefinitionKey } = useConfig<ConfigObject>();
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

    const handlers = { runSearch, showCohort, showQuery, onHistoryChange };
    runRequest(request, handlers, drugOrderSearchDefinitionKey).catch((runError) => setError(runError.message));
  }, [runSearch, showCohort, showQuery, onHistoryChange, drugOrderSearchDefinitionKey]);

  return error;
}

function removeUrlParams() {
  const url = new URL(window.location.href);
  URL_PARAMS.forEach((name) => url.searchParams.delete(name));
  window.history.replaceState(window.history.state, '', url);
}

async function runRequest(request: UrlRequest, handlers: UrlDefinitionHandlers, drugOrderSearchDefinitionKey: string) {
  switch (request.type) {
    case 'cohort':
      return handlers.showCohort(request.uuid);
    case 'query':
      return handlers.showQuery(request.uuid);
    case 'definition':
      return runDefinition(request.definition, handlers, drugOrderSearchDefinitionKey);
  }
}

/**
 * Runs each criterion as its own search, then a composition ANDing them. If any search fails,
 * the history goes back to how it was, so a link never leaves half of its searches behind.
 */
async function runDefinition(
  definition: CohortDefinition,
  { runSearch, onHistoryChange }: UrlDefinitionHandlers,
  drugOrderSearchDefinitionKey: string,
) {
  const { label, criteria } = definition;
  const historyBefore = window.sessionStorage.getItem('openmrsHistory');
  const names = await fetchDisplayNames(definition);

  const runOrRollBack = async ({ searchParams, description }: Search) => {
    if (await runSearch(searchParams, description)) {
      return;
    }
    if (historyBefore === null) {
      window.sessionStorage.removeItem('openmrsHistory');
    } else {
      window.sessionStorage.setItem('openmrsHistory', historyBefore);
    }
    onHistoryChange();
    throw new Error(`The search "${description}" failed, so none of this link's searches were kept`);
  };

  for (const criterion of criteria) {
    const search = buildSearch(criterion, names, drugOrderSearchDefinitionKey);
    // A single criterion is the whole result, so it carries the label; otherwise the composition does.
    await runOrRollBack({ ...search, description: criteria.length === 1 && label ? label : search.description });
  }

  if (criteria.length >= 2) {
    const composition = andLastEntries(getSearchHistory().length, criteria.length);
    await runOrRollBack({
      searchParams: createCompositionQuery(composition),
      description: label || `Composition of ${composition}`,
    });
  }
}
