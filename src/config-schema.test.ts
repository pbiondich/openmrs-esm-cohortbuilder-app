import { describe, expect, it } from 'vitest';
import { getDefaultsFromConfigSchema } from '@openmrs/esm-framework';
import { type ConfigObject, configSchema } from './config-schema';

describe('config schema', () => {
  const defaults = getDefaultsFromConfigSchema(configSchema) as ConfigObject;

  it('keeps drug criteria off at the top level, next to the drug order definition key they depend on', () => {
    expect(defaults.drugCriteriaEnabled).toBe(false);
    expect(Object.keys(configSchema).slice(0, 2)).toEqual(['drugOrderSearchDefinitionKey', 'drugCriteriaEnabled']);
    expect(configSchema.drugCriteriaEnabled._description).toContain('drugOrderSearchDefinitionKey');
  });

  it('turns the omnibar rows on by default when the builder is installed', () => {
    expect(defaults.omnibar.enabled).toBe(true);
    expect(defaults.omnibar.savedSearchMinCharacters).toBe(2);
    expect(defaults.omnibar).not.toHaveProperty('drugCriteriaEnabled');
  });

  it('ships the demo programs and drug groups the cohort parser understands', () => {
    expect(defaults.omnibar.programs.map((program) => program.label)).toEqual([
      'HIV Care and Treatment',
      'PMTCT',
      'HIV Preventative Services (PEP/PrEP)',
      'Outpatient Diabetes Education Program',
    ]);
    expect(defaults.omnibar.drugGroups.map((group) => [group.id, group.drugUuids.length])).toEqual([
      ['arv', 13],
      ['tld', 0],
    ]);
  });
});
