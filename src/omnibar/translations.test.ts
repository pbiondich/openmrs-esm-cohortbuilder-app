import { describe, expect, it } from 'vitest';
import en from '../../translations/en.json';

describe('omnibar translations', () => {
  it('has every key the providers and the contract boundary use, with its English text', () => {
    expect(en).toMatchObject({
      buildCohortPrefix: 'Build cohort:',
      buildCohortSubtitle: 'Runs this search in the Cohort Builder',
      cohortBuilder: 'Cohort Builder',
      cohortBuilderSubtitle: 'Find patients by age, gender, program, drug orders and more',
      cohortMemberCount_one: '{{count}} member',
      cohortMemberCount_other: '{{count}} members',
      omnibarCohorts: 'Cohorts',
      omnibarSavedCohorts: 'Saved cohorts',
      omnibarSavedQueries: 'Saved queries',
      openInCohortBuilder: 'Open in the Cohort Builder',
      results: 'Results',
      runInCohortBuilder: 'Run in the Cohort Builder',
    });
  });
});
