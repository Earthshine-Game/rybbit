import { FilterParams } from "@rybbit/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { clickhouse } from "../../db/clickhouse/clickhouse.js";
import { getFilterStatement } from "./utils/getFilterStatement.js";
import { getTimeStatement, patternToRegex } from "./utils/utils.js";

export const getJourneys = async (
  request: FastifyRequest<{
    Params: { siteId: string };
    Querystring: FilterParams<{
      steps?: string;
      limit?: string;
      stepFilters?: string;
      includeEvents?: string;
      excludeEventNames?: string;
    }>;
  }>,
  reply: FastifyReply
) => {
  try {
    const { siteId } = request.params;
    const { steps = "3", limit = "100", filters, stepFilters, includeEvents = "true", excludeEventNames } = request.query;
    
    // Parse includeEvents parameter (default to true to include events)
    const includeEventsInJourney = includeEvents === "true" || includeEvents === "1";
    
    // Parse excludeEventNames parameter (comma-separated list or JSON array)
    let excludedEventNames: string[] = [];
    if (excludeEventNames) {
      try {
        // Try parsing as JSON array first
        const parsed = JSON.parse(excludeEventNames);
        if (Array.isArray(parsed)) {
          excludedEventNames = parsed.map((name: any) => String(name).trim()).filter(Boolean);
        } else {
          // If not an array, treat as comma-separated string
          excludedEventNames = excludeEventNames.split(",").map((name: string) => name.trim()).filter(Boolean);
        }
      } catch {
        // If JSON parsing fails, treat as comma-separated string
        excludedEventNames = excludeEventNames.split(",").map((name: string) => name.trim()).filter(Boolean);
      }
    }

    const maxSteps = parseInt(steps, 10);
    const journeyLimit = parseInt(limit, 10);

    if (isNaN(maxSteps) || maxSteps < 2 || maxSteps > 10) {
      return reply.status(400).send({
        error: "Steps parameter must be a number between 2 and 10",
      });
    }

    if (isNaN(journeyLimit) || journeyLimit < 1 || journeyLimit > 500) {
      return reply.status(400).send({
        error: "Limit parameter must be a number between 1 and 500",
      });
    }

    // Time conditions using getTimeStatement
    const timeStatement = getTimeStatement(request.query);
    const filterStatement = getFilterStatement(filters, Number(siteId), timeStatement);

    // Parse step filters
    let parsedStepFilters: Record<number, string> = {};
    if (stepFilters) {
      try {
        parsedStepFilters = JSON.parse(stepFilters);
      } catch (error) {
        return reply.status(400).send({
          error: "Invalid stepFilters format",
        });
      }
    }

    // Build step filter conditions for the HAVING clause
    // Supports wildcard patterns: * matches single segment, ** matches multiple segments
    const stepFilterConditions = Object.entries(parsedStepFilters)
      .map(([step, path]) => {
        const stepIndex = parseInt(step, 10) + 1; // ClickHouse arrays are 1-indexed
        if (path.includes("*")) {
          // Use regex matching for wildcard patterns
          const regex = patternToRegex(path);
          return `match(journey[${stepIndex}], '${regex.replace(/'/g, "\\'")}')`;
        }
        // Use exact match for non-wildcard patterns (more efficient)
        return `journey[${stepIndex}] = '${path.replace(/'/g, "''")}'`;
      })
      .join(" AND ");

    // Query to find sequences of events (journeys) for each user
    // Include both pageviews and custom events in the journey
    const result = await clickhouse.query({
      query: `
        WITH user_paths AS (
          SELECT
            session_id,
            arrayCompact(groupArray(step_label)) AS path_sequence
          FROM (
            SELECT
              session_id,
              timestamp,
              -- For pageviews, use pathname (trim to first segment only, e.g., /asset/draft/... -> /asset); for events, use event label format
              CASE
                WHEN type = 'pageview' THEN 
                  IF(length(splitByChar('/', pathname)) >= 3, CONCAT('/', splitByChar('/', pathname)[2]), pathname)
                WHEN type IN ('custom_event', 'button_click', 'copy', 'form_submit', 'input_change', 'outbound') THEN
                  CONCAT('event:', type, IF(event_name != '' AND event_name IS NOT NULL, CONCAT(':', event_name), ''))
                ELSE 
                  IF(length(splitByChar('/', pathname)) >= 3, CONCAT('/', splitByChar('/', pathname)[2]), pathname)
              END AS step_label
            FROM events
            WHERE
              site_id = {siteId:Int32}
              ${timeStatement || ""}
              ${filterStatement || ""}
              AND (
                type = 'pageview'
                ${includeEventsInJourney ? "OR type IN ('custom_event', 'button_click', 'copy', 'form_submit', 'input_change', 'outbound')" : ""}
              )
              ${excludedEventNames.length > 0 
                ? `AND NOT (type IN ('custom_event', 'button_click', 'copy', 'form_submit', 'input_change', 'outbound') AND event_name IN (${excludedEventNames.map(name => `'${name.replace(/'/g, "''")}'`).join(", ")}))` 
                : ""}
            ORDER BY session_id, timestamp
          )
          GROUP BY session_id
          HAVING length(path_sequence) >= 2
        ),

        journey_segments AS (
          SELECT
            arraySlice(path_sequence, 1, {maxSteps:Int32}) AS journey,
            count() AS sessions_count
          FROM user_paths
          GROUP BY journey
          ${stepFilterConditions ? `HAVING ${stepFilterConditions}` : ""}
          ORDER BY sessions_count DESC
          LIMIT {journeyLimit:Int32}
        )

        SELECT
          journey,
          sessions_count,
          sessions_count * 100 / (
            SELECT count(DISTINCT session_id)
            FROM events
            WHERE site_id = {siteId:Int32}
            ${timeStatement || ""}
            ${filterStatement || ""}
          ) AS percentage
        FROM journey_segments
      `,
      query_params: {
        siteId: parseInt(siteId, 10),
        maxSteps: maxSteps,
        journeyLimit: journeyLimit,
      },
    });

    const data = await result.json();

    return reply.send({
      journeys: data.data.map((item: any) => ({
        path: item.journey,
        count: Number(item.sessions_count),
        percentage: Number(item.percentage),
      })),
    });
  } catch (error) {
    console.error("Error getting journeys:", error);
    return reply.status(500).send({ error: "Failed to get journeys" });
  }
};
