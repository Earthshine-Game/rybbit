"use client";

import { useIntersectionObserver } from "@uidotdev/usehooks";
import { useEffect, useMemo } from "react";
import { DateTime } from "luxon";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useGetEventsInfinite } from "../../../../api/analytics/hooks/events/useGetEvents";
import { NothingFound } from "../../../../components/NothingFound";
import { formatter, getCountryName, truncateString } from "../../../../lib/utils";
import { ErrorState } from "../../../../components/ErrorState";
import { ScrollArea } from "../../../../components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table";
import { Avatar, generateName } from "../../../../components/Avatar";
import { EventTypeIcon } from "../../../../components/EventIcons";
import { getEventDisplayName, PROPS_TO_HIDE } from "../../../../lib/events";
import { getTimezone } from "../../../../lib/store";
import { Browser } from "../../components/shared/icons/Browser";
import { CountryFlag } from "../../components/shared/icons/CountryFlag";
import { OperatingSystem } from "../../components/shared/icons/OperatingSystem";
import { Laptop, Smartphone } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../../components/ui/tooltip";
import { Badge } from "../../../../components/ui/badge";
import { Skeleton } from "../../../../components/ui/skeleton";

interface EventLogProps {
  visibleTypes?: Set<string>;
}

// DeviceIcon component for displaying mobile/desktop icons
function DeviceIcon({ deviceType }: { deviceType: string }) {
  const type = deviceType.toLowerCase();
  if (type.includes("mobile") || type.includes("tablet")) {
    return <Smartphone className="w-4 h-4" />;
  }
  return <Laptop className="w-4 h-4" />;
}

export function EventLog({ visibleTypes }: EventLogProps) {
  const { site } = useParams();
  
  // Fetch events with infinite scrolling
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useGetEventsInfinite({
    pageSize: 100,
  });

  // Use the intersection observer hook
  const [ref, entry] = useIntersectionObserver({
    threshold: 0,
    root: null,
    rootMargin: "0px 0px 100px 0px",
  });

  // Fetch next page when intersection observer detects the target is visible
  useEffect(() => {
    if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage();
    }
  }, [entry?.isIntersecting, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading]);

  // Flatten all pages of data and filter by visible types
  const allEvents = useMemo(() => {
    const events = data?.pages.flatMap(page => page.data) || [];
    if (!visibleTypes || visibleTypes.size === 0) return events;
    return events.filter(event => visibleTypes.has(event.type));
  }, [data, visibleTypes]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>TIMESTAMP</TableHead>
              <TableHead>USER</TableHead>
              <TableHead>DEVICE INFO</TableHead>
              <TableHead>PAGE</TableHead>
              <TableHead>DATA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to load events"
        message="There was a problem fetching the events. Please try again later."
      />
    );
  }

  if (allEvents.length === 0) {
    return <NothingFound title={"No events found"} description={"Try a different date range or filter"} />;
  }

  return (
    <ScrollArea className="h-[80vh]">
      <div className="h-full pr-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>TIMESTAMP</TableHead>
              <TableHead>USER</TableHead>
              <TableHead>DEVICE INFO</TableHead>
              <TableHead>PAGE</TableHead>
              <TableHead>DATA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allEvents.map((event, index) => {
              const eventTime = DateTime.fromSQL(event.timestamp, {
                zone: "utc",
              }).setZone(getTimezone());

              const isPageview = event.type === "pageview";
              const isOutbound = event.type === "outbound";
              const isButtonClick = event.type === "button_click";
              const isCopy = event.type === "copy";
              const isFormSubmit = event.type === "form_submit";
              const isInputChange = event.type === "input_change";

              const fullPath = `https://${event.hostname}${event.pathname}${event.querystring ? `${event.querystring}` : ""}`;

              // Parse event properties if they exist
              let eventProperties: Record<string, any> = {};
              if (event.properties && event.properties !== "{}") {
                try {
                  eventProperties = JSON.parse(event.properties);
                } catch (e) {
                  console.error("Failed to parse event properties:", e);
                }
              }

              const propsToHide = PROPS_TO_HIDE[event.type] || [];
              const filteredProps = Object.entries(eventProperties).filter(
                ([key]) => !propsToHide.includes(key)
              );

              return (
                <TableRow key={`${event.timestamp}-${index}`}>
                  <TableCell className="text-xs text-neutral-600 dark:text-neutral-400">
                    {eventTime.toFormat("d MMM, HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    <Link 
                      href={`/${site}/user/${encodeURIComponent(event.user_id)}`}
                      className="flex items-center gap-2 hover:underline"
                    >
                      <Avatar id={event.user_id} size={24} />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">
                        {generateName(event.user_id)}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {event.country && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center">
                              <CountryFlag country={event.country} />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{getCountryName(event.country)}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <Browser browser={event.browser || "Unknown"} />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{event.browser || "Unknown browser"}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <OperatingSystem os={event.operating_system || ""} />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{event.operating_system || "Unknown OS"}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <DeviceIcon deviceType={event.device_type || ""} />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{event.device_type || "Unknown device"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <EventTypeIcon type={event.type} className="w-4 h-4" />
                      {isPageview ? (
                        <Link href={fullPath} target="_blank" rel="noopener noreferrer" className="text-sm hover:underline truncate max-w-[300px]">
                          {truncateString(`${event.pathname}${event.querystring ? `${event.querystring}` : ""}`, 50)}
                        </Link>
                      ) : isOutbound ? (
                        eventProperties.url ? (
                          <Link href={eventProperties.url} target="_blank" rel="noopener noreferrer" className="text-sm hover:underline truncate max-w-[300px]">
                            {truncateString(eventProperties.url, 50)}
                          </Link>
                        ) : (
                          <span className="text-sm">Outbound Link</span>
                        )
                      ) : isButtonClick || isCopy || isFormSubmit || isInputChange ? (
                        <span className="text-sm">
                          {getEventDisplayName({ type: event.type, event_name: event.event_name, props: eventProperties })}
                        </span>
                      ) : (
                        <span className="text-sm">{event.event_name}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {filteredProps.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {filteredProps.slice(0, 2).map(([key, value]) => (
                          <Badge
                            key={key}
                            variant="outline"
                            className="px-1.5 py-0 h-5 text-xs bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium truncate max-w-[120px]"
                          >
                            <span className="text-neutral-600 dark:text-neutral-300 font-light mr-1">{key}:</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate">
                                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <span className="max-w-7xl">
                                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                                </span>
                              </TooltipContent>
                            </Tooltip>
                          </Badge>
                        ))}
                        {filteredProps.length > 2 && (
                          <Badge variant="outline" className="px-1.5 py-0 h-5 text-xs">
                            +{filteredProps.length - 2}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Infinite scroll sentinel */}
        <div ref={ref} className="py-2">
          {isFetchingNextPage && (
            <Table>
              <TableBody>
                {Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={`next-page-${index}`}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
      {/* Pagination info */}
      {data?.pages[0]?.pagination && (
        <div className="text-center text-xs text-neutral-500 dark:text-neutral-400 pt-2">
          Showing {allEvents.length} of {formatter(data.pages[0].pagination.total)} events
        </div>
      )}
    </ScrollArea>
  );
}
