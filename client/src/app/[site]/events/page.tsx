"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/basic-tabs";
import { EVENT_FILTERS } from "@/lib/filterGroups";
import { useGetEventNames } from "../../../api/analytics/hooks/events/useGetEventNames";
import { useGetEventsInfinite } from "../../../api/analytics/hooks/events/useGetEvents";
import { DisabledOverlay } from "../../../components/DisabledOverlay";
import { useSetPageTitle } from "../../../hooks/useSetPageTitle";
import { SubHeader } from "../components/SubHeader/SubHeader";
import { EventList } from "./components/EventList";
import { EventLog } from "./components/EventLog";
import { EventsChart } from "./components/EventsChart";
import { EventTypeFilter } from "../../../components/EventTypeFilter";
import { EventType } from "@/lib/events";


export default function EventsPage() {
  useSetPageTitle("Rybbit · Events");
  const [activeTab, setActiveTab] = useState<"custom" | "types">("custom");
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(
    new Set(["pageview", "custom_event", "outbound", "button_click", "copy", "form_submit", "input_change", "error"])
  );

  const { data: eventNamesData, isLoading: isLoadingEventNames } = useGetEventNames();
  const { data: eventsData } = useGetEventsInfinite({ pageSize: 100 });

  // Get all events for filtering
  const allEvents = useMemo(() => {
    return eventsData?.pages.flatMap(page => page.data) || [];
  }, [eventsData]);

  const toggleEventType = (type: string) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  return (
    <DisabledOverlay message="Events" featurePath="events">
      <div className="p-2 md:p-4 max-w-[1300px] mx-auto space-y-3">
        <SubHeader availableFilters={EVENT_FILTERS} />

        <EventsChart />

        {/* Event Type Filter Buttons */}
        <div className="px-2 md:px-0">
          <EventTypeFilter
            visibleTypes={visibleTypes}
            onToggle={toggleEventType}
            events={allEvents}
          />
        </div>

        <Card>
          <CardHeader>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "custom" | "types")}>
              <TabsList>
                <TabsTrigger value="custom">Custom Events</TabsTrigger>
                <TabsTrigger value="types">Event Types</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "custom" | "types")}>
              <TabsContent value="custom" className="mt-0">
                <EventList events={eventNamesData || []} isLoading={isLoadingEventNames} size="large" />
              </TabsContent>
              <TabsContent value="types" className="mt-0">
                <EventLog visibleTypes={visibleTypes} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DisabledOverlay>
  );
}
