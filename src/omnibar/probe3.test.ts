import { describe, it } from 'vitest';
import { type CohortCriteriaConfig, parseCohortCriteria } from './parse-cohort-criteria';
import { compilePhrases, tokenize } from './phrases/phrase-table';

const hiv = '64f950e6-1b07-4ac0-8e7e-f3e148f3463f';
const tb = '9f144a34-3a4a-44a9-8486-6b7af6cc64f6';
const tdf = '0b8c3c4e-2f9a-4b1e-9d5c-1a2b3c4d5e6f';

const config: CohortCriteriaConfig = {
  drugCriteriaEnabled: true,
  programs: [
    { uuid: hiv, label: 'HIV Care and Treatment', aliases: ['hiv', 'hiv care', 'art'] },
    { uuid: tb, label: 'Tuberculosis Program', aliases: ['tb', 'tuberculosis'] },
  ],
  drugGroups: [
    { id: 'arv', label: 'ARVs', aliases: ['arv', 'arvs', 'antiretrovirals'], drugUuids: [tdf], cielConceptUuids: [] },
  ],
  encounterTypes: [],
};

const parse = (text: string) => parseCohortCriteria(text, config);
const crit = (text: string) => parse(text)?.criteria ?? null;

describe('edge cases - focused', () => {
  it('under 12 months - age 0 rejection', () => {
    // "under 12 months" → 12/12=1, maxAge = 1-1 = 0 → rejected (maxAge===0)
    // BUT: "at most 12 months" → atMost: maxAge = 1 (NOT 1-1) → ok
    // "at most 11 months" → 11 % 12 !== 0 → null ✓
    // "under 13 months" → 13 % 12 !== 0 → null (odd months not whole years) ✓
    // What about "younger than 1"?  under 1 → maxAge = 1-1 = 0 → rejected ✓
    console.log('under 12 months:', JSON.stringify(crit('patients under 12 months')));
    // Should be null: maxAge would be 0 → rejected 
    // But wait: for "under 12 months" → readYears returns years=1
    // comparator "under" → bounds = maxAge = 1-1 = 0
    // maxAge === 0 → return null ✓
  });
  
  it('age band null edge: banded=true with bandMin > bandMax', () => {
    // After banding: if (minAge != null && maxAge != null && minAge > maxAge) return null
    // "adults under 10" → adults band: minAge=18+, explicit under 10 → maxAge=9
    // After banding: minAge = max(0??0, 18) = 18, maxAge = min(9??MAX_AGE, MAX_AGE) = 9
    // Wait, "adults under 10":
    //   banded=true (adults), bandMin=18, bandMax=MAX_AGE
    //   explicit: maxAge=9 (under 10)
    //   After: minAge = max(0??0, 18) = 18, maxAge = min(9, MAX_AGE) = 9
    //   18 > 9 → return null ✓
    console.log('adults under 10:', JSON.stringify(crit('adults under 10')));
    // "elderly under 50":
    //   banded=true, bandMin=60, bandMax=MAX_AGE
    //   explicit: maxAge=49 (under 50)
    //   After: minAge=max(0,60)=60, maxAge=min(49,MAX_AGE)=49
    //   60 > 49 → null ✓
    console.log('elderly under 50:', JSON.stringify(crit('elderly under 50')));
  });
  
  it('stopword multi-word vs single-word: "at least" vs "at"', () => {
    // "at least" is in atLeast. "at" is NOT in stopwords.
    // So "at" alone is an unknown word → return null
    console.log('at:', JSON.stringify(crit('women at')));
    const P = compilePhrases();
    console.log('stopwords containing "at":', P.stopwords.filter(t => t.includes('at')));
  });
  
  it('vocabulary: uuid case sensitivity', () => {
    // mergeVocabulary uses uuid.toLowerCase() for comparison
    // toServerVocabulary uses program.uuid as string (no case normalization)
    // So if config has uppercase UUID and server has lowercase, it would still match via merge
    // But the parser uses includes() and isUuid() which is just format check
    // The criteria output uses the config's uuid (not normalized)
    // This should be fine since UUIDs come from the same server
    console.log('uuid case handled in merge: yes (toLowerCase)');
  });
  
  it('programs: two linkers', () => {
    // matchProgram allows up to 2 linkers before the program name
    // "enrolled in the HIV" - enrolled + "in" linker + "the" linker? No: "in" and "the" 
    // Wait: programLinkers is checked, not specific words. Let me check.
    const P = compilePhrases();
    console.log('programLinkers:', P.programLinkers.map(t => t.join(' ')));
    console.log('enrolled in the hiv care:', JSON.stringify(crit('enrolled in the hiv care')));
    // linker 1: "in", linker 2: "the" → then "hiv care" alias → match
  });

  it('age: "1000 years old" hits MAX_AGE check', () => {
    // isAge(1000) → 1000 > MAX_AGE (150) → false → return null ✓
    console.log('1000 years old:', JSON.stringify(crit('patients 1000 years old')));
    // "over 150" → minAge = 151 → isAge(151) → false → null ✓  
    console.log('over 150:', JSON.stringify(crit('patients over 150')));
    // "aged 150" → minAge=maxAge=150 → isAge(150) → ok → result!
    console.log('aged 150:', JSON.stringify(crit('patients aged 150')));
  });
  
  it('longestAlias: tied program names → null', () => {
    // Two programs with same alias at same position → tied → null
    const programs = [
      { uuid: hiv, label: 'HIV Program', aliases: ['hiv'] },
      { uuid: tb, label: 'HIV Treatment', aliases: ['hiv'] },  // same alias!
    ];
    const tiedConfig: CohortCriteriaConfig = { ...config, programs };
    console.log('tied programs:', JSON.stringify(parseCohortCriteria('in hiv program', tiedConfig)));
    // "hiv" matches both with length 1 → tied → null → no match → null ✓
  });
  
  it('range: "between X and Y" where X > Y', () => {
    // "between 50 and 15" → minAge=50, maxAge=15 → minAge > maxAge → null ✓
    console.log('between 50 and 15:', JSON.stringify(crit('patients between 50 and 15')));
  });
  
  it('gender conflict from age group + explicit gender', () => {
    // WRA sets gender=female. "men" sets gender=male.
    // "men of reproductive age" → at pos 0, longest match:
    //   matchGender: "men" → {next:1, gender:male}
    //   matchAge: "men of reproductive age" → tries ageGroups: "men" doesn't match "women of reproductive age"
    //     "men" isn't an age group. So matchAge at "men" → no age match.
    //   Longest: matchGender wins → gender=male, advance to 1
    //   At "of": stopword? "of" is stopword → skip
    //   At "reproductive": matchAge tries ageGroups: but "women of reproductive age" starts with "women"
    //     not "reproductive". So no match. Unknown word → null ✓
    console.log('men of reproductive age:', JSON.stringify(crit('men of reproductive age')));
    // → null because "reproductive" is unknown
  });
  
  it('band intersection with two non-overlapping groups', () => {
    // "paediatric adults": paediatric=maxAge:14, adults=minAge:18
    // banded=true
    // bandMin = max(0, 18) = 18
    // bandMax = min(14, MAX_AGE) = 14  
    // 18 > 14 → null ✓ ... but wait: 
    // Is it bandMax=14 or MAX_AGE?
    // paediatric: maxAge=14, minAge=undefined
    // adults: minAge=18, maxAge=undefined
    // Processing order matters!
    // "paediatric" age group: minAge=undefined, maxAge=14
    //   bandMin = max(0, minAge??0) = max(0,0) = 0
    //   bandMax = min(MAX_AGE, maxAge??MAX_AGE) = min(MAX_AGE, 14) = 14
    // "adults" age group: minAge=18, maxAge=undefined
    //   bandMin = max(0, 18) = 18
    //   bandMax = min(14, MAX_AGE) = 14
    // After banding: minAge=max(undefined??0, 18)=18, maxAge=min(undefined??MAX_AGE, 14)=14
    //   if minAge===0 → undefined (not the case, 18)
    //   if maxAge===MAX_AGE → undefined (not the case, 14)
    // minAge=18, maxAge=14 → 18>14 → null ✓
    console.log('paediatric adults:', JSON.stringify(crit('paediatric adults')));
  });
  
  it('programs: "hiv" alias vs "hiv care" alias - longest wins', () => {
    // "enrolled in hiv care" → longestAlias at "hiv":
    //   "hiv" alias (1 word, next=current+1)
    //   "hiv care" alias (2 words, next=current+2) - this is longer → wins
    console.log('enrolled in hiv care:', JSON.stringify(crit('enrolled in hiv care')));
    // Should give HIV program
  });
  
  it('tokenize: digit-letter splitting', () => {
    // "30y" → ["30", "y"] (split at digit-letter boundary)
    console.log('30y:', tokenize('30y'));
    // "u5" → ["u", "5"]
    console.log('u5:', tokenize('u5'));
    // "30yo" → ["30", "yo"]
    console.log('30yo:', tokenize('30yo'));
    // "15yo" → parse as 15 years old?
    console.log('patients 15yo:', JSON.stringify(crit('patients 15yo')));
    // Actually "yo" - is that in yearsOld list?
    const P = compilePhrases();
    console.log('yearsOld list:', P.yearsOld.map(t => t.join(' ')));
  });
});
