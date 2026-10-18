import dayjs from 'dayjs';
import type { DropdownValue, SearchParams } from '../types';
import * as demographics from '../components/search-by-demographics/search-by-demographics.utils';
import * as drugOrders from '../components/search-by-drug-orders/search-by-drug-orders.utils';
import * as enrollments from '../components/search-by-enrollments/search-by-enrollments.utils';

// The URL contract is shared with the omnibar; see the README section
// "Opening the builder with a pre-filled definition".

export const URL_PARAMS = ['definition', 'cohort', 'query'] as const;

export const MAX_DEFINITION_BYTES = 4096;
const MAX_ENCODED_LENGTH = Math.ceil(MAX_DEFINITION_BYTES / 3) * 4;
const MAX_LABEL_LENGTH = 200;
const MAX_CRITERIA = 5;
const MAX_PROGRAMS = 10;
const MAX_DRUGS = 50;
const MAX_AGE = 150;

// Standard uuids, plus 36-character CIEL-style ids such as "1065AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".
const UUID_PATTERN = /^[0-9A-Za-z-]{36}$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

export interface DemographicsCriterion {
  type: 'demographics';
  gender?: 'male' | 'female' | 'any';
  minAge?: number;
  maxAge?: number;
}

export interface EnrollmentCriterion {
  type: 'enrollment';
  programs: string[];
  enrolledOnOrAfter?: string;
  enrolledOnOrBefore?: string;
}

export interface DrugOrderCriterion {
  type: 'drugOrder';
  drugs: string[];
  activeOnOrAfter?: string;
  activeOnOrBefore?: string;
}

export type Criterion = DemographicsCriterion | EnrollmentCriterion | DrugOrderCriterion;

export interface CohortDefinition {
  v: 1;
  label?: string;
  criteria: Criterion[];
}

export type UrlRequest =
  | { type: 'definition'; definition: CohortDefinition }
  | { type: 'cohort'; uuid: string }
  | { type: 'query'; uuid: string };

export interface Search {
  searchParams: SearchParams;
  description: string;
}

/**
 * Reads the single request the URL asks for (definition > cohort > query).
 * Returns null when none is present and throws an Error with a readable message when it is invalid.
 */
export function readUrlRequest(params: URLSearchParams): UrlRequest | null {
  const [chosen, ...ignored] = URL_PARAMS.filter((name) => params.has(name));
  if (ignored.length) {
    console.warn(`Cohort builder: using "${chosen}" and ignoring ${ignored.map((name) => `"${name}"`).join(', ')}`);
  }

  const value = params.get(chosen);
  switch (chosen) {
    case 'definition':
      return { type: 'definition', definition: decodeDefinition(value) };
    case 'cohort':
    case 'query':
      if (!isUuid(value)) {
        throw new Error(`"${chosen}" must be a uuid`);
      }
      return { type: chosen, uuid: value };
    default:
      return null;
  }
}

export function decodeDefinition(encoded: string): CohortDefinition {
  if (encoded.length > MAX_ENCODED_LENGTH) {
    throw new Error(`Definition is larger than ${MAX_DEFINITION_BYTES} bytes`);
  }
  const json = decodeBase64Url(encoded);

  let definition: unknown;
  try {
    definition = JSON.parse(json);
  } catch {
    throw new Error('Definition is not valid JSON');
  }
  return validateDefinition(definition);
}

function decodeBase64Url(encoded: string): string {
  if (!BASE64URL_PATTERN.test(encoded)) {
    throw new Error('Definition is not valid base64url');
  }
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');

  let binary: string;
  try {
    binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  } catch {
    throw new Error('Definition is not valid base64url');
  }
  if (binary.length > MAX_DEFINITION_BYTES) {
    throw new Error(`Definition is larger than ${MAX_DEFINITION_BYTES} bytes`);
  }

  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Definition is not valid UTF-8');
  }
}

export function validateDefinition(value: unknown): CohortDefinition {
  const definition = expectObject(value, 'Definition', ['v', 'label', 'criteria']);

  if (definition.v !== 1) {
    throw new Error('Definition version "v" must be 1');
  }
  if (
    definition.label !== undefined &&
    (typeof definition.label !== 'string' || definition.label.length > MAX_LABEL_LENGTH)
  ) {
    throw new Error(`"label" must be text of at most ${MAX_LABEL_LENGTH} characters`);
  }
  if (
    !Array.isArray(definition.criteria) ||
    definition.criteria.length < 1 ||
    definition.criteria.length > MAX_CRITERIA
  ) {
    throw new Error(`"criteria" must list 1 to ${MAX_CRITERIA} criteria`);
  }

  return {
    v: 1,
    label: definition.label as string | undefined,
    criteria: definition.criteria.map(validateCriterion),
  };
}

function validateCriterion(value: unknown, index: number): Criterion {
  const name = `Criterion ${index + 1}`;
  const type = (value as { type?: unknown })?.type;

  switch (type) {
    case 'demographics': {
      const criterion = expectObject(value, name, ['type', 'gender', 'minAge', 'maxAge']);
      const { gender = 'any', minAge, maxAge } = criterion;
      if (gender !== 'male' && gender !== 'female' && gender !== 'any') {
        throw new Error(`${name}: "gender" must be "male", "female" or "any"`);
      }
      expectOptionalAge(minAge, `${name}: "minAge"`);
      expectOptionalAge(maxAge, `${name}: "maxAge"`);
      if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
        throw new Error(`${name}: "minAge" must not be greater than "maxAge"`);
      }
      if (gender === 'any' && minAge === undefined && maxAge === undefined) {
        throw new Error(`${name}: give a gender, "minAge" or "maxAge"`);
      }
      return { type, gender, minAge: minAge as number | undefined, maxAge: maxAge as number | undefined };
    }
    case 'enrollment': {
      const criterion = expectObject(value, name, ['type', 'programs', 'enrolledOnOrAfter', 'enrolledOnOrBefore']);
      const { programs, enrolledOnOrAfter, enrolledOnOrBefore } = criterion;
      expectUuids(programs, `${name}: "programs"`, MAX_PROGRAMS);
      expectOptionalDate(enrolledOnOrAfter, `${name}: "enrolledOnOrAfter"`, false);
      expectOptionalDate(enrolledOnOrBefore, `${name}: "enrolledOnOrBefore"`, false);
      return {
        type,
        programs: programs as string[],
        enrolledOnOrAfter: enrolledOnOrAfter as string | undefined,
        enrolledOnOrBefore: enrolledOnOrBefore as string | undefined,
      };
    }
    case 'drugOrder': {
      const criterion = expectObject(value, name, ['type', 'drugs', 'activeOnOrAfter', 'activeOnOrBefore']);
      const { drugs, activeOnOrAfter, activeOnOrBefore } = criterion;
      expectUuids(drugs, `${name}: "drugs"`, MAX_DRUGS);
      expectOptionalDate(activeOnOrAfter, `${name}: "activeOnOrAfter"`, true);
      expectOptionalDate(activeOnOrBefore, `${name}: "activeOnOrBefore"`, true);
      return {
        type,
        drugs: drugs as string[],
        activeOnOrAfter: activeOnOrAfter as string | undefined,
        activeOnOrBefore: activeOnOrBefore as string | undefined,
      };
    }
    default:
      throw new Error(`${name}: "type" must be "demographics", "enrollment" or "drugOrder"`);
  }
}

function expectObject(value: unknown, name: string, allowedKeys: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object`);
  }
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.includes(key));
  if (unknownKey !== undefined) {
    throw new Error(`${name} has an unknown key "${unknownKey}"`);
  }
  return value as Record<string, unknown>;
}

function expectOptionalAge(value: unknown, name: string) {
  if (value !== undefined && (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_AGE)) {
    throw new Error(`${name} must be a whole number from 0 to ${MAX_AGE}`);
  }
}

function expectUuids(value: unknown, name: string, max: number) {
  if (!Array.isArray(value) || value.length < 1 || value.length > max || !value.every(isUuid)) {
    throw new Error(`${name} must list 1 to ${max} uuids`);
  }
}

function expectOptionalDate(value: unknown, name: string, allowToday: boolean) {
  if (value === undefined || (allowToday && value === 'today') || isIsoDate(value)) {
    return;
  }
  throw new Error(`${name} must be ${allowToday ? '"today" or ' : ''}a date like 2024-01-31`);
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isIsoDate(value: unknown): boolean {
  const match = typeof value === 'string' && ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Turns "today" or YYYY-MM-DD into the same local-midnight string the builder's date pickers produce.
 * "today" is resolved when this is called, so shared links stay relative.
 */
export function toQueryDate(value: string | undefined): string {
  if (value === undefined) {
    return '';
  }
  return (value === 'today' ? dayjs() : dayjs(value)).startOf('day').format();
}

/**
 * Builds the reportingrest query and history description for one criterion using the
 * same builders as the search tabs. `names` maps program/drug uuids to display names;
 * when any is missing the description falls back to a count such as "3 drugs".
 */
export function buildSearch(criterion: Criterion, names: Map<string, string>): Search {
  switch (criterion.type) {
    case 'demographics': {
      const params = {
        gender: { male: 'males', female: 'females', any: 'all' }[criterion.gender],
        minAge: criterion.minAge ?? 0,
        maxAge: criterion.maxAge ?? 0,
        birthDayStartDate: '',
        birthDayEndDate: '',
        livingStatus: 'alive',
      };
      return { searchParams: demographics.getQueryDetails(params), description: demographics.getDescription(params) };
    }
    case 'enrollment': {
      const params = {
        enrolledOnOrAfter: toQueryDate(criterion.enrolledOnOrAfter),
        enrolledOnOrBefore: toQueryDate(criterion.enrolledOnOrBefore),
        completedOnOrAfter: '',
        completedOnOrBefore: '',
        selectedPrograms: toDropdownValues(criterion.programs, names),
        selectedLocations: null,
      };
      return {
        searchParams: enrollments.getQueryDetails(params),
        description: enrollments.getDescription({
          ...params,
          selectedPrograms: toDescribedValues(criterion.programs, names, 'program', 'programs'),
        }),
      };
    }
    case 'drugOrder': {
      const params = {
        selectedDrugs: toDropdownValues(criterion.drugs, names),
        selectedCareSetting: null,
        activeOnOrAfter: toQueryDate(criterion.activeOnOrAfter),
        activeOnOrBefore: toQueryDate(criterion.activeOnOrBefore),
        activatedOnOrAfter: '',
        activatedOnOrBefore: '',
      };
      return {
        searchParams: drugOrders.getQueryDetails(params),
        description: drugOrders.getDescription({
          ...params,
          selectedDrugs: toDescribedValues(criterion.drugs, names, 'drug', 'drugs'),
        }),
      };
    }
  }
}

function toDropdownValues(uuids: string[], names: Map<string, string>): DropdownValue[] {
  return uuids.map((uuid, index) => ({ id: index, label: names.get(uuid) ?? uuid, value: uuid }));
}

function toDescribedValues(
  uuids: string[],
  names: Map<string, string>,
  singular: string,
  plural: string,
): DropdownValue[] {
  if (uuids.every((uuid) => names.has(uuid))) {
    return toDropdownValues(uuids, names);
  }
  return [{ id: 0, label: `${uuids.length} ${uuids.length === 1 ? singular : plural}`, value: '' }];
}

/** The composition text that ANDs the last `count` history entries, e.g. "4 AND 5 AND 6". */
export function andLastEntries(historyLength: number, count: number): string {
  return Array.from({ length: count }, (_, index) => historyLength - count + index + 1).join(' AND ');
}
