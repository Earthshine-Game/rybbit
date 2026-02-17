import { FilterParams } from "@rybbit/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { clickhouse } from "../../db/clickhouse/clickhouse.js";
import { getFilterStatement } from "./utils/getFilterStatement.js";
import { getTimeStatement } from "./utils/utils.js";

export interface JourneyStepEventDetails {
  button_name?: {
    value: string;
    count: number;
  }[];
  click_coordinate?: {
    value: string;
    count: number;
  }[];
  [key: string]: {
    value: string;
    count: number;
  }[] | undefined;
}

export const getJourneyStepEventDetails = async (
  request: FastifyRequest<{
    Params: { siteId: string };
    Querystring: FilterParams<{
      stepLabel: string;
      stepIndex?: string;
    }>;
  }>,
  reply: FastifyReply
) => {
  try {
    const { siteId } = request.params;
    const { stepLabel, stepIndex, filters } = request.query;

    if (!stepLabel) {
      return reply.status(400).send({
        error: "stepLabel parameter is required",
      });
    }

    const timeStatement = getTimeStatement(request.query);
    const filterStatement = getFilterStatement(filters, Number(siteId), timeStatement);

    // Parse stepIndex (0-based, but we'll use 1-based for array indexing)
    const stepIndexNum = stepIndex ? parseInt(stepIndex, 10) : null;
    const targetStepPosition = stepIndexNum !== null ? stepIndexNum + 1 : null; // Convert to 1-based for array indexing

    // Query to aggregate event properties ONLY for events at this specific step position
    // We use window functions to number events in each session, then filter to only events
    // that match the stepLabel at the target stepIndex
    const result = await clickhouse.query({
      query: `
        WITH numbered_events AS (
          SELECT
            session_id,
            timestamp,
            props,
            -- Calculate step_label (same logic as getJourneys)
            CASE
              WHEN type = 'pageview' THEN 
                CASE
                  WHEN startsWith(pathname, '/asset/draft/') THEN '/asset/draft'
                  ELSE pathname
                END
              WHEN type IN ('custom_event', 'button_click', 'copy', 'form_submit', 'input_change', 'outbound') THEN
                CONCAT('event:', type, IF(event_name != '' AND event_name IS NOT NULL, CONCAT(':', event_name), ''))
              ELSE 
                CASE
                  WHEN startsWith(pathname, '/asset/draft/') THEN '/asset/draft'
                  ELSE pathname
                END
            END AS step_label,
            -- Number events within each session
            row_number() OVER (PARTITION BY session_id ORDER BY timestamp) AS step_number
          FROM events
          WHERE
            site_id = {siteId:Int32}
            ${timeStatement || ""}
            ${filterStatement || ""}
            AND (
              type = 'pageview'
              OR type IN ('custom_event', 'button_click', 'copy', 'form_submit', 'input_change', 'outbound')
            )
        ),
        
        target_step_events AS (
          SELECT
            session_id,
            timestamp,
            props
          FROM numbered_events
          WHERE
            step_label = '${stepLabel.replace(/'/g, "''")}'
            ${targetStepPosition !== null ? `AND step_number = ${targetStepPosition}` : ""}
        ),
        
        events_with_props AS (
          SELECT
            session_id,
            timestamp,
            props
          FROM target_step_events
          WHERE
            props != '{}'
            AND props IS NOT NULL
        )
        
        SELECT
          kv.1 AS propertyKey,
          replaceRegexpAll(kv.2, '^"|"$', '') AS propertyValue,
          count() AS count
        FROM events_with_props
        ARRAY JOIN JSONExtractKeysAndValuesRaw(CAST(props AS String)) AS kv
        GROUP BY propertyKey, propertyValue
        ORDER BY propertyKey ASC, count DESC
        LIMIT 500
      `,
      query_params: {
        siteId: parseInt(siteId, 10),
      },
    });

    const data = await result.json();
    
    // Group properties by key
    const groupedProperties: JourneyStepEventDetails = {};
    
    if (data.data && Array.isArray(data.data)) {
      data.data.forEach((item: any) => {
        const key = item.propertyKey;
        const value = item.propertyValue;
        const count = Number(item.count);
        
        if (!groupedProperties[key]) {
          groupedProperties[key] = [];
        }
        
        groupedProperties[key]!.push({ value, count });
      });

      // Sort each property array by count (descending)
      Object.keys(groupedProperties).forEach(key => {
        groupedProperties[key]!.sort((a, b) => b.count - a.count);
      });
    }

    return reply.send({
      properties: groupedProperties,
    });
  } catch (error) {
    console.error("Error getting journey step event details:", error);
    return reply.status(500).send({ error: "Failed to get journey step event details" });
  }
};
