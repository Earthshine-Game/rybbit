"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { EVENT_TYPE_CONFIG, EventType } from "@/lib/events";
import { EventTypeIcon } from "./EventIcons";

interface EventTypeFilterProps {
  visibleTypes: Set<string>;
  onToggle: (type: string) => void;
  events: { type: string }[];
}

export function EventTypeFilter({
  visibleTypes,
  onToggle,
  events,
}: EventTypeFilterProps) {
  // Calculate counts for each event type
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const event of events) {
      result[event.type] = (result[event.type] || 0) + 1;
    }
    return result;
  }, [events]);

  // Check if all types are visible (realtime mode)
  const isRealtime = visibleTypes.size === EVENT_TYPE_CONFIG.length;

  return (
    <div className="flex items-center space-x-2 overflow-x-auto pb-2">
      {/* Realtime button - shows when all types are visible */}
      <button
        onClick={() => {
          // Toggle all types
          if (isRealtime) {
            // If realtime, show only pageview
            visibleTypes.forEach(type => onToggle(type));
            if (!visibleTypes.has("pageview")) {
              onToggle("pageview");
            }
          } else {
            // If not realtime, show all types
            EVENT_TYPE_CONFIG.forEach(config => {
              if (!visibleTypes.has(config.value)) {
                onToggle(config.value);
              }
            });
          }
        }}
        className={cn(
          "flex items-center space-x-1.5 px-2 py-1 rounded text-xs font-medium transition-all whitespace-nowrap",
          isRealtime
            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700"
            : "bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-400"
        )}
      >
        <span>Realtime</span>
      </button>

      {EVENT_TYPE_CONFIG.map((option) => {
        const isSelected = visibleTypes.has(option.value);
        const count = counts[option.value] || 0;

        return (
          <button
            key={option.value}
            onClick={() => onToggle(option.value)}
            className={cn(
              "flex items-center space-x-1.5 px-2 py-1 rounded text-xs font-medium transition-all whitespace-nowrap",
              isSelected
                ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                : "bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-400"
            )}
          >
            <div
              className={cn(
                "transition-opacity",
                isSelected ? "opacity-100" : "opacity-30"
              )}
            >
              <EventTypeIcon type={option.value as EventType} className="h-3 w-3" />
            </div>
            <span>{option.label}</span>
            {count > 0 && (
              <span
                className={cn(
                  "ml-1 px-1.5 py-0.5 rounded-full text-[10px] leading-none",
                  isSelected
                    ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-500"
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
