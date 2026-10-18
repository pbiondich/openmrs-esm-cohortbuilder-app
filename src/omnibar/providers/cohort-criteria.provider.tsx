import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '@openmrs/esm-framework';
import { type ConfigObject } from '../../config-schema';
import { type CohortDefinition } from '../../url-definition/url-definition';
import { definitionUrl } from '../cohort-builder-links';
import { type OmnibarProviderProps } from '../omnibar-contract';
import { type CohortCriteriaConfig, cohortCriteriaConfig, parseCohortCriteria } from '../parse-cohort-criteria';
import { useCohortRowsAllowed } from '../use-cohort-rows-allowed';

/**
 * One "Build cohort: …" row when the whole query parses into a cohort definition, from config alone.
 * Nothing is fetched while typing; the cohort builder runs the search after the row is chosen.
 */

/**
 * Seam for an AI parser of queries the deterministic one can't read. Deliberately not implemented
 * and not wired. Per the omnibar rules a model never runs on its own: an AI parser may only run
 * after the user picks an explicit row that says it asks AI (as "Ask ChartSearch" does), never per
 * keystroke and never as a silent fallback for a query that failed to parse.
 */
export interface CohortCriteriaFallbackParser {
  parse(text: string, config: CohortCriteriaConfig, signal: AbortSignal): Promise<CohortDefinition | null>;
}

const CohortCriteriaProvider: React.FC<OmnibarProviderProps> = (props) => {
  const { query, report } = props;
  const { t } = useTranslation();
  const config = useConfig<ConfigObject>();
  const allowed = useCohortRowsAllowed(props);
  const criteriaConfig = useMemo(() => cohortCriteriaConfig(config), [config]);

  const offer = useMemo(() => {
    const definition = allowed ? parseCohortCriteria(query, criteriaConfig) : null;
    const to = definition ? definitionUrl(definition) : null;
    return to ? { label: definition.label, to } : null;
  }, [allowed, query, criteriaConfig]);

  useEffect(() => {
    const title = t('omnibarCohorts', 'Cohorts');
    if (!offer) {
      report({ query, title, status: 'idle' });
      return;
    }
    report({
      query,
      title,
      status: 'ready',
      results: [
        {
          id: 'cohort-definition',
          // The label comes from config. It is appended as text for React to escape, not interpolated by
          // i18next, which would either escape it a second time or need escaping turned off.
          title: `${t('buildCohortPrefix', 'Build cohort:')} ${offer.label}`,
          subtitle: t('buildCohortSubtitle', 'Runs this search in the Cohort Builder'),
          target: { type: 'navigate', to: offer.to },
        },
      ],
    });
  }, [query, offer, report, t]);

  return null;
};

export default CohortCriteriaProvider;
