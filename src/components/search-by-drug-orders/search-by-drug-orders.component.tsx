import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Column, DatePicker, DatePickerInput, Dropdown, MultiSelect } from '@carbon/react';
import { useTranslation } from 'react-i18next';
import { showSnackbar, useConfig } from '@openmrs/esm-framework';
import { type ConfigObject } from '../../config-schema';
import { withSelectedItems } from '../../cohort-builder.utils';
import type { DropdownValue, DrugOrderDetails, SearchByProps } from '../../types';
import { getDescription, getQueryDetails } from './search-by-drug-orders.utils';
import { useCareSettings, useDrugs } from './search-by-drug-orders.resources';
import SearchButtonSet from '../search-button-set/search-button-set';
import styles from './search-by-drug-orders.style.scss';

interface SearchByDrugOrderProps extends SearchByProps {
  /** The values to start with, such as a definition link's. */
  initialValues?: DrugOrderDetails;
}

const SearchByDrugOrder: React.FC<SearchByDrugOrderProps> = ({ onSubmit, initialValues }) => {
  const { t } = useTranslation();
  const { drugOrderSearchDefinitionKey } = useConfig<ConfigObject>();
  const { drugs, drugsError } = useDrugs();
  const { careSettings, careSettingsError } = useCareSettings();
  const [activeOnOrAfter, setActiveOnOrAfter] = useState(initialValues?.activeOnOrAfter ?? '');
  const [activeOnOrBefore, setActiveOnOrBefore] = useState(initialValues?.activeOnOrBefore ?? '');
  const [activatedOnOrAfter, setActivatedOnOrAfter] = useState(initialValues?.activatedOnOrAfter ?? '');
  const [activatedOnOrBefore, setActivatedOnOrBefore] = useState(initialValues?.activatedOnOrBefore ?? '');
  const [selectedDrugs, setSelectedDrugs] = useState<DropdownValue[]>(initialValues?.selectedDrugs ?? null);
  const [selectedCareSetting, setSelectedCareSetting] = useState<DropdownValue>(
    initialValues?.selectedCareSetting ?? null,
  );
  const drugOptions = withSelectedItems(drugs, selectedDrugs);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (drugsError) {
      showSnackbar({
        title: t('error', 'Error'),
        kind: 'error',
        isLowContrast: false,
        subtitle: drugsError?.message,
      });
    }
  }, [drugsError, t]);

  useEffect(() => {
    if (careSettingsError) {
      showSnackbar({
        title: t('error', 'Error'),
        kind: 'error',
        isLowContrast: false,
        subtitle: careSettingsError?.message,
      });
    }
  }, [careSettingsError, t]);

  const handleResetInputs = () => {
    setSelectedDrugs(null);
    setSelectedCareSetting(null);
    setActiveOnOrAfter('');
    setActiveOnOrBefore('');
    setActivatedOnOrAfter('');
    setActivatedOnOrBefore('');
  };

  const submit = async () => {
    setIsLoading(true);
    const drugOrderParams: DrugOrderDetails = {
      selectedDrugs,
      selectedCareSetting,
      activeOnOrAfter,
      activeOnOrBefore,
      activatedOnOrAfter,
      activatedOnOrBefore,
    };
    await onSubmit(getQueryDetails(drugOrderParams, drugOrderSearchDefinitionKey), getDescription(drugOrderParams));
    setIsLoading(false);
  };

  return (
    <>
      <Column>
        <div>
          <MultiSelect
            id="drugs"
            data-testid="drugs"
            onChange={(data) => setSelectedDrugs(data.selectedItems)}
            items={drugOptions.items}
            selectedItems={drugOptions.selectedItems}
            label={t('selectDrugs', 'Select drugs')}
          />
        </div>
      </Column>
      <div className={styles.column}>
        <Column>
          <Dropdown
            id="careSettings"
            data-testid="careSettings"
            onChange={(data) => setSelectedCareSetting(data.selectedItem)}
            initialSelectedItem={selectedCareSetting ?? careSettings[0]}
            items={careSettings}
            label={t('selectCareSettings', 'Select a care setting')}
            titleText=""
          />
        </Column>
      </div>
      <div className={styles.column}>
        <Column>
          <DatePicker
            dateFormat="d-m-Y"
            datePickerType="single"
            allowInput={false}
            onChange={(date) => setActiveOnOrAfter(dayjs(date[0]).format())}
            value={activeOnOrAfter && dayjs(activeOnOrAfter).format('DD-MM-YYYY')}
          >
            <DatePickerInput
              id="activeOnOrAfter"
              labelText={t('using', 'Using between')}
              placeholder="DD-MM-YYYY"
              size="md"
            />
          </DatePicker>
        </Column>
        <Column>
          <DatePicker
            dateFormat="d-m-Y"
            datePickerType="single"
            allowInput={false}
            onChange={(date) => setActiveOnOrBefore(dayjs(date[0]).format())}
            value={activeOnOrBefore && dayjs(activeOnOrBefore).format('DD-MM-YYYY')}
          >
            <DatePickerInput id="activeOnOrBefore" labelText={t('to', 'to')} placeholder="DD-MM-YYYY" size="md" />
          </DatePicker>
        </Column>
      </div>
      <div className={styles.column}>
        <Column>
          <DatePicker
            dateFormat="d-m-Y"
            datePickerType="single"
            allowInput={false}
            onChange={(date) => setActivatedOnOrAfter(dayjs(date[0]).format())}
            value={activatedOnOrAfter && dayjs(activatedOnOrAfter).format('DD-MM-YYYY')}
          >
            <DatePickerInput
              id="activatedOnOrAfter"
              labelText={t('used', 'Used between')}
              placeholder="DD-MM-YYYY"
              size="md"
            />
          </DatePicker>
        </Column>
        <Column>
          <DatePicker
            dateFormat="d-m-Y"
            datePickerType="single"
            allowInput={false}
            onChange={(date) => setActivatedOnOrBefore(dayjs(date[0]).format())}
            value={activatedOnOrBefore && dayjs(activatedOnOrBefore).format('DD-MM-YYYY')}
          >
            <DatePickerInput id="activatedOnOrBefore" labelText={t('and', 'and')} placeholder="DD-MM-YYYY" size="md" />
          </DatePicker>
        </Column>
      </div>
      <SearchButtonSet onHandleReset={handleResetInputs} onHandleSubmit={submit} isLoading={isLoading} />
    </>
  );
};

export default SearchByDrugOrder;
