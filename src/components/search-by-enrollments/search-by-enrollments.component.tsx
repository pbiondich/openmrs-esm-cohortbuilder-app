import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Column, DatePicker, DatePickerInput, MultiSelect } from '@carbon/react';
import { showSnackbar } from '@openmrs/esm-framework';
import { useTranslation } from 'react-i18next';
import { useLocations } from '../../cohort-builder.resources';
import { withSelectedItems } from '../../cohort-builder.utils';
import { type DropdownValue, type SearchByProps } from '../../types';
import { usePrograms } from './search-by-enrollments.resources';
import { type EnrollmentsSearchParams, getQueryDetails, getDescription } from './search-by-enrollments.utils';
import SearchButtonSet from '../search-button-set/search-button-set';
import styles from './search-by-enrollments.style.scss';

interface SearchByEnrollmentsProps extends SearchByProps {
  /** The values to start with, such as a definition link's. */
  initialValues?: EnrollmentsSearchParams;
}

const SearchByEnrollments: React.FC<SearchByEnrollmentsProps> = ({ onSubmit, initialValues }) => {
  const { t } = useTranslation();
  const { programs, programsError } = usePrograms();
  const { locations, locationsError } = useLocations();
  const [enrolledOnOrAfter, setEnrolledOnOrAfter] = useState(initialValues?.enrolledOnOrAfter ?? '');
  const [enrolledOnOrBefore, setEnrolledOnOrBefore] = useState(initialValues?.enrolledOnOrBefore ?? '');
  const [completedOnOrAfter, setCompletedOnOrAfter] = useState(initialValues?.completedOnOrAfter ?? '');
  const [completedOnOrBefore, setCompletedOnOrBefore] = useState(initialValues?.completedOnOrBefore ?? '');
  const [selectedLocations, setSelectedLocations] = useState<DropdownValue[]>(initialValues?.selectedLocations ?? null);
  const [selectedPrograms, setSelectedPrograms] = useState<DropdownValue[]>(initialValues?.selectedPrograms ?? null);
  const programOptions = withSelectedItems(programs, selectedPrograms);
  const locationOptions = withSelectedItems(locations, selectedLocations);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (programsError) {
      showSnackbar({
        title: t('error', 'Error'),
        kind: 'error',
        isLowContrast: false,
        subtitle: programsError?.message,
      });
    }
  }, [programsError, t]);

  useEffect(() => {
    if (locationsError) {
      showSnackbar({
        title: t('error', 'Error'),
        kind: 'error',
        isLowContrast: false,
        subtitle: locationsError?.message,
      });
    }
  }, [locationsError, t]);

  const handleResetInputs = () => {
    setSelectedPrograms(null);
    setEnrolledOnOrAfter('');
    setEnrolledOnOrBefore('');
    setCompletedOnOrAfter('');
    setCompletedOnOrBefore('');
  };

  const submit = async () => {
    setIsLoading(true);
    const searchParams = {
      enrolledOnOrAfter,
      enrolledOnOrBefore,
      completedOnOrAfter,
      completedOnOrBefore,
      selectedPrograms,
      selectedLocations,
    };
    await onSubmit(getQueryDetails(searchParams), getDescription(searchParams));
    setIsLoading(false);
  };

  return (
    <>
      <Column>
        <div>
          <MultiSelect
            id="programs"
            data-testid="programs"
            onChange={(data) => setSelectedPrograms(data.selectedItems)}
            items={programOptions.items}
            selectedItems={programOptions.selectedItems}
            label={t('selectPrograms', 'Select programs')}
          />
        </div>
      </Column>
      <Column>
        <div>
          <MultiSelect
            id="locations"
            data-testid="locations"
            onChange={(data) => setSelectedLocations(data.selectedItems)}
            items={locationOptions.items}
            selectedItems={locationOptions.selectedItems}
            label={t('selectLocations', 'Select locations')}
          />
        </div>
      </Column>
      <div className={styles.column}>
        <Column>
          <DatePicker
            datePickerType="single"
            allowInput={false}
            onChange={(date) => setEnrolledOnOrAfter(dayjs(date[0]).format())}
            value={enrolledOnOrAfter && dayjs(enrolledOnOrAfter).format('DD-MM-YYYY')}
          >
            <DatePickerInput
              id="enrolledOnOrAfter"
              labelText={t('enrolledBetween', 'Enrolled between')}
              placeholder="DD-MM-YYYY"
              size="md"
            />
          </DatePicker>
        </Column>
        <Column>
          <DatePicker
            datePickerType="single"
            allowInput={false}
            onChange={(date) => setEnrolledOnOrBefore(dayjs(date[0]).format())}
            value={enrolledOnOrBefore && dayjs(enrolledOnOrBefore).format('DD-MM-YYYY')}
          >
            <DatePickerInput id="enrolledOnOrBefore" labelText={t('and', 'and')} placeholder="DD-MM-YYYY" size="md" />
          </DatePicker>
        </Column>
      </div>
      <div className={styles.column}>
        <Column>
          <DatePicker
            datePickerType="single"
            allowInput={false}
            onChange={(date) => setCompletedOnOrAfter(dayjs(date[0]).format())}
            value={completedOnOrAfter && dayjs(completedOnOrAfter).format('DD-MM-YYYY')}
          >
            <DatePickerInput
              id="completedOnOrAfter"
              labelText={t('completedBetween', 'Completed between')}
              placeholder="DD-MM-YYYY"
              size="md"
            />
          </DatePicker>
        </Column>
        <Column>
          <DatePicker
            datePickerType="single"
            allowInput={false}
            onChange={(date) => setCompletedOnOrBefore(dayjs(date[0]).format())}
            value={completedOnOrBefore && dayjs(completedOnOrBefore).format('DD-MM-YYYY')}
          >
            <DatePickerInput id="completedOnOrBefore" labelText={t('and', 'and')} placeholder="DD-MM-YYYY" size="md" />
          </DatePicker>
        </Column>
      </div>
      <SearchButtonSet onHandleReset={handleResetInputs} onHandleSubmit={submit} isLoading={isLoading} />
    </>
  );
};

export default SearchByEnrollments;
