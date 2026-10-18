import useSWRImmutable from 'swr/immutable';
import { openmrsFetch, restBaseUrl, type FetchResponse } from '@openmrs/esm-framework';
import type { Patient, SearchParams, DropdownValue, Response } from './types';

/**
 * @param searchParams query details
 */

interface SearchResults {
  rows: Patient[];
}

export const search = async (searchParams: SearchParams) => {
  const searchResults: FetchResponse<SearchResults> = await openmrsFetch(
    `${restBaseUrl}/reportingrest/adhocquery?v=full`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: searchParams.query,
    },
  );
  return searchResults;
};

/**
 * @returns Locations
 */
export const useLocations = () => {
  const { data, error } = useSWRImmutable<{
    data: { results: Response[] };
  }>(`${restBaseUrl}/location`, openmrsFetch);

  const locations: DropdownValue[] = [];
  data?.data.results.map((location: Response, index: number) => {
    locations.push({
      id: index,
      label: location.display,
      value: location.uuid,
    });
  });

  return {
    isLoading: !data && !error,
    locations,
    locationsError: error,
  };
};

export const getDataSet = async (queryID: string) => {
  const results: FetchResponse<SearchResults> = await openmrsFetch(`${restBaseUrl}/reportingrest/dataSet/${queryID}`, {
    method: 'GET',
  });

  const dataset = results.data.rows.map((patient: Patient) => {
    patient.id = patient.patientId.toString();
    patient.name = `${patient.firstname} ${patient.lastname}`;

    return patient;
  });

  return dataset;
};

interface CohortMembership {
  patientUuid: string;
  endDate: string | null;
  voided: boolean;
}

interface CohortMembershipPage {
  results: CohortMembership[];
  links?: Array<{ rel: string }>;
}

interface CohortMemberDetails {
  patientId: number;
  person: { gender: string; age: number; preferredName: { givenName: string; familyName: string } };
}

const MEMBERSHIP_PAGE_SIZE = 100;

/**
 * webservices.rest has no cohort members endpoint, only the paged `cohort/{uuid}/membership`
 * subresource, which gives patient uuids. Each active member is then loaded for the results table.
 */
export const getCohortMembers = async (cohortId: string) => {
  const memberships: CohortMembership[] = [];
  let hasNextPage = true;
  while (hasNextPage) {
    const { data }: FetchResponse<CohortMembershipPage> = await openmrsFetch(
      `${restBaseUrl}/cohort/${cohortId}/membership?v=custom:(patientUuid,endDate,voided)&limit=${MEMBERSHIP_PAGE_SIZE}&startIndex=${memberships.length}`,
    );
    memberships.push(...data.results);
    hasNextPage = data.results.length > 0 && Boolean(data.links?.some((link) => link.rel === 'next'));
  }

  const now = new Date();
  const activeMembers = memberships.filter(
    (membership) => !membership.voided && (!membership.endDate || new Date(membership.endDate) > now),
  );

  return Promise.all(
    activeMembers.map(async ({ patientUuid }): Promise<Patient> => {
      const {
        data: { patientId, person },
      }: FetchResponse<CohortMemberDetails> = await openmrsFetch(
        `${restBaseUrl}/patient/${patientUuid}?v=custom:(patientId,person:(gender,age,preferredName:(givenName,familyName)))`,
      );
      const { givenName, familyName } = person.preferredName;
      return {
        id: patientId.toString(),
        patientId,
        name: `${givenName} ${familyName}`,
        firstname: givenName,
        lastname: familyName,
        age: person.age,
        gender: person.gender,
      };
    }),
  );
};
