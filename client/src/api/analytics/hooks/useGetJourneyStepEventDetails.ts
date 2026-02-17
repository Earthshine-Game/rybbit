import { useQuery } from "@tanstack/react-query";
import { Time } from "../../../components/DateSelector/types";
import { JOURNEY_PAGE_FILTERS } from "../../../lib/filterGroups";
import { getFilteredFilters, useStore } from "../../../lib/store";
import { buildApiParams } from "../../utils";
import { fetchJourneyStepEventDetails, JourneyStepEventDetails, JourneyStepEventDetailsParams } from "../endpoints";

export interface UseJourneyStepEventDetailsParams {
  siteId?: number;
  stepLabel: string;
  stepIndex?: number;
  time: Time;
  enabled?: boolean;
}

export const useJourneyStepEventDetails = ({ 
  siteId, 
  stepLabel, 
  stepIndex, 
  time,
  enabled = true 
}: UseJourneyStepEventDetailsParams) => {
  const { timezone } = useStore();
  const filteredFilters = getFilteredFilters(JOURNEY_PAGE_FILTERS);
  const params = buildApiParams(time, { filters: filteredFilters });

  return useQuery<JourneyStepEventDetails>({
    queryKey: ["journey-step-event-details", siteId, stepLabel, stepIndex, time, filteredFilters, timezone],
    queryFn: () =>
      fetchJourneyStepEventDetails(siteId!, {
        ...params,
        stepLabel,
        stepIndex,
      }),
    enabled: !!siteId && !!stepLabel && enabled,
    placeholderData: previousData => previousData,
  });
};
