import { useQuery } from "@tanstack/react-query";
import { Time } from "../../../components/DateSelector/types";
import { JOURNEY_PAGE_FILTERS } from "../../../lib/filterGroups";
import { getFilteredFilters, useStore } from "../../../lib/store";
import { buildApiParams } from "../../utils";
import { fetchJourneyTransitionSessions, JourneyTransitionSessionsParams, JourneyTransitionSessionsResponse } from "../endpoints";

export interface UseJourneyTransitionSessionsParams {
  siteId?: number;
  source: string;
  target: string;
  sourceStep?: number;
  targetStep?: number;
  time: Time;
  includeEvents?: boolean;
  excludeEventNames?: string[];
  limit?: number;
  page?: number;
  enabled?: boolean;
}

export const useJourneyTransitionSessions = ({
  siteId,
  source,
  target,
  sourceStep,
  targetStep,
  time,
  includeEvents = true,
  excludeEventNames,
  limit = 50,
  page = 1,
  enabled = true,
}: UseJourneyTransitionSessionsParams) => {
  const { timezone } = useStore();
  const filteredFilters = getFilteredFilters(JOURNEY_PAGE_FILTERS);
  const params = buildApiParams(time, { filters: filteredFilters });

  return useQuery<JourneyTransitionSessionsResponse>({
    queryKey: [
      "journey-transition-sessions",
      siteId,
      source,
      target,
      sourceStep,
      targetStep,
      time,
      filteredFilters,
      includeEvents,
      excludeEventNames,
      limit,
      page,
      timezone,
    ],
    queryFn: () =>
      fetchJourneyTransitionSessions(siteId!, {
        ...params,
        source,
        target,
        sourceStep,
        targetStep,
        includeEvents,
        excludeEventNames,
        limit,
        page,
      }),
    enabled: !!siteId && enabled && !!source && !!target,
    placeholderData: previousData => previousData,
  });
};
