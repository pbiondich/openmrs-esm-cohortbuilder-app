import { describe, expect, it } from 'vitest';
import en from '../../translations/en.json';

describe('omnibar translations', () => {
  it('has every key the providers and the contract boundary use, with its English text', () => {
    expect(en).toMatchObject({
      cohortBuilder: 'Cohort Builder',
      cohortBuilderSubtitle: 'Find patients by age, gender, program, drug orders and more',
      cohortMemberCount_one: '{{count}} member',
      cohortMemberCount_other: '{{count}} members',
      omnibarCohortCount: 'Patient count',
      omnibarCohortCountPatients_one: '{{formattedCount}} patient',
      omnibarCohortCountPatients_other: '{{formattedCount}} patients',
      // Nested, as the omnibar reads them: omnibarCommand.<id>.aliases, .label and .description.
      omnibarCommand: {
        cohort: {
          aliases: 'cohort, count',
          description: 'Count patients by age, gender, program or encounter type',
          label: 'Cohorts',
        },
      },
      omnibarCohorts: 'Cohorts',
      omnibarCounting: 'Counting…',
      omnibarSavedCohorts: 'Saved cohorts',
      omnibarSavedQueries: 'Saved queries',
      openInCohortBuilder: 'Open in the Cohort Builder',
      results: 'Results',
      runInCohortBuilder: 'Run in the Cohort Builder',
    });
  });
});
